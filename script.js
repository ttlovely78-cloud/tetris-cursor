// ─── 상수 ───────────────────────────────────────────────────────────────────

/** 보드 가로 칸 수 */
const COLS = 10;

/** 보드 세로 칸 수 */
const ROWS = 20;

/** 블록 자동 낙하 간격 (밀리초) */
const DROP_INTERVAL_MS = 800;

/** 한 번에 삭제한 줄 수별 점수 */
const LINE_SCORES = {
  1: 100,
  2: 300,
  3: 500,
  4: 800,
};

/** 테트로미노 블록 정의 (모양 행렬) */
const PIECES = {
  I: { shape: [[1, 1, 1, 1]] },
  O: { shape: [[1, 1], [1, 1]] },
  T: { shape: [[0, 1, 0], [1, 1, 1]] },
  S: { shape: [[0, 1, 1], [1, 1, 0]] },
  Z: { shape: [[1, 1, 0], [0, 1, 1]] },
  J: { shape: [[1, 0, 0], [1, 1, 1]] },
  L: { shape: [[0, 0, 1], [1, 1, 1]] },
};

/** @type {string[]} */
const PIECE_TYPES = Object.keys(PIECES);

// ─── 상태 ───────────────────────────────────────────────────────────────────

/** @type {HTMLElement | null} */
let boardElement = null;

/** @type {HTMLElement | null} */
let scoreElement = null;

/** @type {HTMLElement | null} */
let gameStatusElement = null;

/** @type {HTMLElement[]} */
let boardCellElements = [];

/** @type {(string | null)[][]} */
let board = [];

/**
 * @typedef {Object} Piece
 * @property {string} type - 블록 종류 (I, O, T, S, Z, J, L)
 * @property {number[][]} shape - 블록 모양 행렬
 * @property {number} row - 보드 상단 기준 행 위치
 * @property {number} col - 보드 상단 기준 열 위치
 */

/** @type {Piece | null} */
let currentPiece = null;

/** @type {number} */
let score = 0;

/** @type {boolean} */
let isPlaying = false;

/** @type {boolean} */
let isGameOver = false;

/** @type {number | null} */
let dropTimerId = null;

/** @type {boolean} */
let isKeyboardBound = false;

// ─── 보드 ───────────────────────────────────────────────────────────────────

/**
 * 빈 보드 데이터를 생성한다.
 * @returns {(string | null)[][]} null로 채워진 2차원 배열
 */
function createEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

/**
 * 빈 보드 한 줄을 생성한다.
 * @returns {(string | null)[]} null로 채워진 1차원 배열
 */
function createEmptyRow() {
  return Array(COLS).fill(null);
}

/**
 * 좌표가 보드 범위 안인지 확인한다.
 * @param {number} row - 행
 * @param {number} col - 열
 * @returns {boolean} 범위 안이면 true
 */
function isWithinBoard(row, col) {
  return row >= 0 && row < ROWS && col >= 0 && col < COLS;
}

/**
 * 가득 찬 줄을 삭제하고 위 줄을 내린다.
 * @returns {number} 삭제된 줄 수
 */
function clearLines() {
  const rowsAfterClear = [];
  let linesCleared = 0;

  for (let row = 0; row < ROWS; row++) {
    const isRowFull = board[row].every((cell) => cell !== null);

    if (isRowFull) {
      linesCleared++;
    } else {
      rowsAfterClear.push(board[row]);
    }
  }

  while (rowsAfterClear.length < ROWS) {
    rowsAfterClear.unshift(createEmptyRow());
  }

  board = rowsAfterClear;
  return linesCleared;
}

// ─── 블록 ───────────────────────────────────────────────────────────────────

/**
 * 무작위 블록 종류를 반환한다.
 * @returns {string} 블록 종류
 */
function getRandomPieceType() {
  const randomIndex = Math.floor(Math.random() * PIECE_TYPES.length);
  return PIECE_TYPES[randomIndex];
}

/**
 * 지정한 종류의 테트로미노 블록을 생성한다.
 * @param {string} type - 블록 종류 (I, O, T, S, Z, J, L)
 * @returns {Piece} 생성된 블록 객체
 */
function createPiece(type) {
  const pieceDefinition = PIECES[type];

  if (!pieceDefinition) {
    throw new Error(`알 수 없는 블록 종류: ${type}`);
  }

  const shapeWidth = pieceDefinition.shape[0].length;

  return {
    type,
    shape: pieceDefinition.shape.map((row) => [...row]),
    row: 0,
    col: Math.floor((COLS - shapeWidth) / 2),
  };
}

/**
 * 블록의 채워진 칸마다 콜백을 실행한다.
 * @param {Piece} piece - 대상 블록
 * @param {number} rowOffset - 행 이동량
 * @param {number} colOffset - 열 이동량
 * @param {(boardRow: number, boardCol: number) => void} onFilledCell - 콜백
 */
function forEachFilledCell(piece, rowOffset, colOffset, onFilledCell) {
  piece.shape.forEach((shapeRow, shapeRowIndex) => {
    shapeRow.forEach((cell, shapeColIndex) => {
      if (!cell) {
        return;
      }

      onFilledCell(
        piece.row + shapeRowIndex + rowOffset,
        piece.col + shapeColIndex + colOffset
      );
    });
  });
}

/**
 * 블록 모양 행렬을 시계 방향으로 90도 회전한다.
 * @param {number[][]} shape - 회전할 모양 행렬
 * @returns {number[][]} 회전된 모양 행렬
 */
function rotateShape(shape) {
  const rowCount = shape.length;
  const colCount = shape[0].length;
  const rotatedShape = Array.from({ length: colCount }, () =>
    Array(rowCount).fill(0)
  );

  for (let row = 0; row < rowCount; row++) {
    for (let col = 0; col < colCount; col++) {
      rotatedShape[col][rowCount - 1 - row] = shape[row][col];
    }
  }

  return rotatedShape;
}

/**
 * 새 블록을 생성한다. 생성 위치에 겹치면 게임을 종료한다.
 * @returns {boolean} 새 블록 생성에 성공하면 true
 */
function spawnPiece() {
  currentPiece = createPiece(getRandomPieceType());

  if (!canMove(currentPiece, 0, 0, board)) {
    currentPiece = null;
    setGameOver();
    return false;
  }

  return true;
}

/**
 * 현재 블록을 보드에 고정한다.
 */
function lockPiece() {
  if (!currentPiece) {
    return;
  }

  const lockedType = currentPiece.type;

  forEachFilledCell(currentPiece, 0, 0, (boardRow, boardCol) => {
    if (isWithinBoard(boardRow, boardCol)) {
      board[boardRow][boardCol] = lockedType;
    }
  });
}

// ─── 충돌 · 이동 ────────────────────────────────────────────────────────────

/**
 * 블록이 이동 가능한지 충돌 판정한다.
 * @param {Piece} piece - 판정할 블록
 * @param {number} deltaCol - 가로 이동량
 * @param {number} deltaRow - 세로 이동량
 * @param {(string | null)[][]} boardMatrix - 고정된 블록이 있는 보드
 * @returns {boolean} 이동 가능하면 true
 */
function canMove(piece, deltaCol, deltaRow, boardMatrix) {
  let isValidMove = true;

  forEachFilledCell(piece, deltaRow, deltaCol, (boardRow, boardCol) => {
    if (!isValidMove) {
      return;
    }

    if (boardCol < 0 || boardCol >= COLS || boardRow >= ROWS) {
      isValidMove = false;
      return;
    }

    if (boardRow < 0) {
      return;
    }

    if (boardMatrix[boardRow][boardCol] !== null) {
      isValidMove = false;
    }
  });

  return isValidMove;
}

/**
 * 블록 이동을 시도한다.
 * @param {number} deltaCol - 가로 이동량
 * @param {number} deltaRow - 세로 이동량
 * @returns {boolean} 이동에 성공하면 true
 */
function tryMovePiece(deltaCol, deltaRow) {
  if (!currentPiece || !canMove(currentPiece, deltaCol, deltaRow, board)) {
    return false;
  }

  currentPiece.row += deltaRow;
  currentPiece.col += deltaCol;
  return true;
}

/**
 * 이동에 성공하면 보드를 다시 그린다.
 * @param {number} deltaCol - 가로 이동량
 * @param {number} deltaRow - 세로 이동량
 * @returns {boolean} 이동에 성공하면 true
 */
function tryMovePieceAndRender(deltaCol, deltaRow) {
  if (!tryMovePiece(deltaCol, deltaRow)) {
    return false;
  }

  renderBoard();
  return true;
}

/**
 * 현재 블록 회전을 시도한다. 충돌 시 회전을 취소한다.
 * @returns {boolean} 회전에 성공하면 true
 */
function tryRotatePiece() {
  if (!currentPiece) {
    return false;
  }

  const shapeBeforeRotate = currentPiece.shape.map((row) => [...row]);
  currentPiece.shape = rotateShape(currentPiece.shape);

  if (!canMove(currentPiece, 0, 0, board)) {
    currentPiece.shape = shapeBeforeRotate;
    return false;
  }

  renderBoard();
  return true;
}

// ─── 점수 ───────────────────────────────────────────────────────────────────

/**
 * 삭제된 줄 수에 따른 점수를 계산한다.
 * @param {number} linesCleared - 한 번에 삭제된 줄 수
 * @returns {number} 획득 점수
 */
function calculateLineScore(linesCleared) {
  if (linesCleared <= 0) {
    return 0;
  }

  return LINE_SCORES[linesCleared] ?? linesCleared * 100;
}

/**
 * 점수를 증가시키고 화면을 갱신한다.
 * @param {number} points - 추가할 점수
 */
function addScore(points) {
  score += points;
  updateScoreDisplay(score);
}

/**
 * 줄 삭제 점수를 반영한다.
 * @param {number} linesCleared - 삭제된 줄 수
 */
function applyLineClearScore(linesCleared) {
  if (linesCleared > 0) {
    addScore(calculateLineScore(linesCleared));
  }
}

// ─── 게임 흐름 ──────────────────────────────────────────────────────────────

/**
 * 현재 블록을 고정하고 줄 삭제·점수 반영 후 새 블록을 생성한다.
 */
function lockPieceAndSpawn() {
  lockPiece();
  applyLineClearScore(clearLines());
  spawnPiece();
  renderBoard();
}

/**
 * 게임 오버 상태로 전환한다.
 */
function setGameOver() {
  isGameOver = true;
  isPlaying = false;
  stopDropLoop();
  updateGameStatusDisplay();
}

/**
 * 블록을 바닥까지 즉시 내린다.
 */
function hardDrop() {
  if (!isPlaying || !currentPiece) {
    return;
  }

  while (tryMovePiece(0, 1)) {}

  lockPieceAndSpawn();
}

/**
 * 자동 낙하를 한 칸 처리한다.
 */
function dropPiece() {
  if (!isPlaying || !currentPiece) {
    return;
  }

  if (tryMovePiece(0, 1)) {
    renderBoard();
    return;
  }

  lockPieceAndSpawn();
}

/**
 * 자동 낙하 타이머를 시작한다.
 */
function startDropLoop() {
  stopDropLoop();
  dropTimerId = window.setInterval(dropPiece, DROP_INTERVAL_MS);
}

/**
 * 자동 낙하 타이머를 중지한다.
 */
function stopDropLoop() {
  if (dropTimerId !== null) {
    clearInterval(dropTimerId);
    dropTimerId = null;
  }
}

/**
 * 게임 상태를 초기화하고 보드를 렌더링한다.
 */
function resetGame() {
  stopDropLoop();
  isPlaying = false;
  isGameOver = false;
  board = createEmptyBoard();
  currentPiece = createPiece(getRandomPieceType());
  score = 0;
  updateScoreDisplay(score);
  updateGameStatusDisplay();
  renderBoard();
}

/**
 * 게임을 시작한다.
 */
function startGame() {
  resetGame();
  isPlaying = true;
  isGameOver = false;
  updateGameStatusDisplay();
  startDropLoop();
}

// ─── 렌더링 ─────────────────────────────────────────────────────────────────

/**
 * 보드 위에 현재 블록을 합쳐 화면에 그릴 격자를 만든다.
 * @param {(string | null)[][]} boardMatrix - 고정된 블록이 있는 보드
 * @param {Piece} piece - 현재 블록
 * @returns {(string | null)[][]} 블록이 반영된 표시용 격자
 */
function drawPiece(boardMatrix, piece) {
  const displayGrid = boardMatrix.map((row) => [...row]);

  forEachFilledCell(piece, 0, 0, (boardRow, boardCol) => {
    if (isWithinBoard(boardRow, boardCol)) {
      displayGrid[boardRow][boardCol] = piece.type;
    }
  });

  return displayGrid;
}

/**
 * 보드 DOM 격자를 초기화한다.
 */
function setupBoardGrid() {
  if (!boardElement) {
    return;
  }

  boardElement.innerHTML = "";
  boardCellElements = [];

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      boardElement.appendChild(cell);
      boardCellElements.push(cell);
    }
  }
}

/**
 * 보드와 현재 블록을 CSS grid 셀에 렌더링한다.
 */
function renderBoard() {
  if (!boardElement) {
    return;
  }

  const displayGrid = currentPiece ? drawPiece(board, currentPiece) : board;

  boardCellElements.forEach((cell) => {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    const cellValue = displayGrid[row][col];

    cell.className = "cell";

    if (cellValue) {
      cell.classList.add("filled", `piece-${cellValue.toLowerCase()}`);
    }
  });
}

/**
 * 화면의 점수 표시를 갱신한다.
 * @param {number} value - 표시할 점수
 */
function updateScoreDisplay(value) {
  if (scoreElement) {
    scoreElement.textContent = String(value);
  }
}

/**
 * 게임 상태 메시지를 갱신한다.
 */
function updateGameStatusDisplay() {
  if (!gameStatusElement) {
    return;
  }

  gameStatusElement.classList.remove("game-over");

  if (isGameOver) {
    gameStatusElement.textContent = "게임 오버";
    gameStatusElement.classList.add("game-over");
    return;
  }

  if (isPlaying) {
    gameStatusElement.textContent = "진행 중";
    return;
  }

  gameStatusElement.textContent = "대기 중";
}

// ─── 입력 ───────────────────────────────────────────────────────────────────

/**
 * 키보드 입력을 처리한다.
 * @param {KeyboardEvent} event - 키보드 이벤트
 */
function handleKeyDown(event) {
  if (!isPlaying || !currentPiece) {
    return;
  }

  switch (event.code) {
    case "ArrowLeft":
      event.preventDefault();
      tryMovePieceAndRender(-1, 0);
      break;
    case "ArrowRight":
      event.preventDefault();
      tryMovePieceAndRender(1, 0);
      break;
    case "ArrowDown":
      event.preventDefault();
      tryMovePieceAndRender(0, 1);
      break;
    case "ArrowUp":
      event.preventDefault();
      tryRotatePiece();
      break;
    case "Space":
      if (event.repeat) {
        return;
      }
      event.preventDefault();
      hardDrop();
      break;
    default:
      break;
  }
}

/**
 * 키보드 이벤트 리스너를 한 번만 등록한다.
 */
function setupKeyboardControls() {
  if (isKeyboardBound) {
    return;
  }

  document.addEventListener("keydown", handleKeyDown);
  isKeyboardBound = true;
}

/**
 * 시작·재시작 버튼 클릭 시 호출된다.
 */
function handleGameStart() {
  startGame();
}

// ─── 초기화 ─────────────────────────────────────────────────────────────────

/**
 * DOM 요소를 연결하고 초기 화면을 렌더링한다.
 */
function init() {
  boardElement = document.getElementById("game-board");
  scoreElement = document.getElementById("score");
  gameStatusElement = document.getElementById("game-status");
  const startButton = document.getElementById("start-btn");
  const restartButton = document.getElementById("restart-btn");

  if (
    !boardElement ||
    !scoreElement ||
    !gameStatusElement ||
    !startButton ||
    !restartButton
  ) {
    console.error("필요한 DOM 요소를 찾을 수 없습니다.");
    return;
  }

  setupBoardGrid();
  setupKeyboardControls();
  startButton.addEventListener("click", handleGameStart);
  restartButton.addEventListener("click", handleGameStart);
  resetGame();
}

init();
