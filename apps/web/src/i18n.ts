import { useEffect, useMemo, useState } from "react";

import { BLACK, GameSnapshot, MoveLogEntry, Phase, PlayerColor } from "./types";

export type Language = "en" | "zh-Hans";

export type StatusMessage =
  | { kind: "restored" }
  | { kind: "played"; color: PlayerColor; coord: string }
  | { kind: "bothPassed"; winner: PlayerColor; margin: string }
  | { kind: "passed"; color: PlayerColor }
  | { kind: "resigned"; color: PlayerColor; winner: PlayerColor }
  | { kind: "undid" }
  | { kind: "newGame"; size: number }
  | { kind: "scoreEstimate"; winner: PlayerColor; margin: string };

export interface TranslationBundle {
  language: Language;
  languageToggleText: string;
  languageToggleAria: string;
  labels: {
    board: string;
    boardArea: string;
    controlsAndStatus: string;
    coordinates: string;
    currentTurn: string;
    exportSgf: string;
    gameActions: string;
    gameSetup: string;
    movePreview: string;
    moveRecord: string;
    newGame: string;
    noMovesYet: string;
    pass: string;
    players: string;
    record: string;
    resign: string;
    score: string;
    scoreEstimate: string;
    undo: string;
  };
  boardDescription(size: number): string;
  boardCanvasAria(size: number): string;
  color(color: PlayerColor): string;
  phase(phase: Phase): string;
  captureCount(count: number): string;
  move(move: MoveLogEntry): string;
  currentPlayer(color: PlayerColor): string;
  winner(color: PlayerColor | null): string;
  defaultStatus(game: GameSnapshot): string;
  status(message: StatusMessage): string;
  legalMoveError(reason: string): string;
  confirm: {
    changeBoardSize: string;
    newGame: string;
    resign(color: PlayerColor): string;
  };
  toast: {
    externalPlayer(color: PlayerColor): string;
    noMovesToUndo: string;
    sgfDownloaded: string;
    sgfDownloadedAndCopied: string;
    externalPlayerFailed: string;
  };
  scoreLabels: {
    blackTerritory: string;
    whiteTerritory: string;
    blackTotal: string;
    whiteTotal: string;
  };
}

const LANGUAGE_STORAGE_KEY = "tengen-language";

function englishColor(color: PlayerColor) {
  return color === BLACK ? "Black" : "White";
}

function chineseColor(color: PlayerColor) {
  return color === BLACK ? "黑方" : "白方";
}

const english: TranslationBundle = {
  language: "en",
  languageToggleText: "中文",
  languageToggleAria: "Switch language to Simplified Chinese",
  labels: {
    board: "Board",
    boardArea: "Game board",
    controlsAndStatus: "Game controls and status",
    coordinates: "Coordinates",
    currentTurn: "Current turn",
    exportSgf: "Export SGF",
    gameActions: "Game actions",
    gameSetup: "Game setup",
    movePreview: "Move preview",
    moveRecord: "Move record",
    newGame: "New game",
    noMovesYet: "No moves yet.",
    pass: "Pass",
    players: "Players",
    record: "Record",
    resign: "Resign",
    score: "Score",
    scoreEstimate: "Score estimate",
    undo: "Undo",
  },
  boardDescription: (size) => `${size} x ${size} board`,
  boardCanvasAria: (size) => `Interactive ${size} by ${size} go board`,
  color: englishColor,
  phase: (phase) => {
    if (phase === "scoring") return "Scoring";
    if (phase === "ended") return "Ended";
    return "Playing";
  },
  captureCount: (count) => `${count} capture${count === 1 ? "" : "s"}`,
  move: (move) => {
    if (move.type === "move") {
      const captureText = move.captures > 0 ? `, captures ${move.captures}` : "";
      return `${move.number}. ${englishColor(move.color)} ${move.coord}${captureText}`;
    }

    if (move.type === "pass") return `${move.number}. ${englishColor(move.color)} passes`;
    return `${move.number}. ${englishColor(move.color)} resigns`;
  },
  currentPlayer: (color) => `${englishColor(color)} to play`,
  winner: (color) => (color ? `${englishColor(color)} wins` : "Game finished"),
  defaultStatus: (game) => {
    if (game.gameOver && game.result) return `Result: ${game.result}.`;
    if (game.phase === "scoring") return "Final score estimate is shown below.";
    return "Place a stone on any open intersection.";
  },
  status: (message) => {
    if (message.kind === "restored") return "Restored saved game.";
    if (message.kind === "played") return `${englishColor(message.color)} played ${message.coord}.`;
    if (message.kind === "bothPassed") {
      return `Both players passed. ${englishColor(message.winner)} leads by ${message.margin}.`;
    }
    if (message.kind === "passed") return `${englishColor(message.color)} passed.`;
    if (message.kind === "resigned") {
      return `${englishColor(message.color)} resigned. ${englishColor(message.winner)} wins.`;
    }
    if (message.kind === "undid") return "Undid the last action.";
    if (message.kind === "newGame") return `New ${message.size} x ${message.size} game.`;
    return `Current estimate: ${englishColor(message.winner)} leads by ${message.margin}.`;
  },
  legalMoveError: (reason) => reason,
  confirm: {
    changeBoardSize: "Changing board size starts a new game. Continue?",
    newGame: "Start a new game and clear the board?",
    resign: (color) => `${englishColor(color)} resigns?`,
  },
  toast: {
    externalPlayer: (color) => `${englishColor(color)} is controlled by an external player.`,
    noMovesToUndo: "No moves to undo.",
    sgfDownloaded: "SGF downloaded.",
    sgfDownloadedAndCopied: "SGF downloaded and copied to clipboard.",
    externalPlayerFailed: "External player failed to return a move.",
  },
  scoreLabels: {
    blackTerritory: "Black territory",
    whiteTerritory: "White territory",
    blackTotal: "Black total",
    whiteTotal: "White total",
  },
};

const chinese: TranslationBundle = {
  language: "zh-Hans",
  languageToggleText: "EN",
  languageToggleAria: "切换到英文",
  labels: {
    board: "棋盘",
    boardArea: "对局棋盘",
    controlsAndStatus: "对局控制和状态",
    coordinates: "坐标",
    currentTurn: "当前回合",
    exportSgf: "导出 SGF",
    gameActions: "对局操作",
    gameSetup: "对局设置",
    movePreview: "落子预览",
    moveRecord: "棋谱记录",
    newGame: "新对局",
    noMovesYet: "暂无落子。",
    pass: "虚手",
    players: "对局双方",
    record: "记录",
    resign: "认输",
    score: "数目",
    scoreEstimate: "形势估算",
    undo: "悔棋",
  },
  boardDescription: (size) => `${size} 路棋盘`,
  boardCanvasAria: (size) => `可交互的 ${size} 路围棋棋盘`,
  color: chineseColor,
  phase: (phase) => {
    if (phase === "scoring") return "数目中";
    if (phase === "ended") return "已结束";
    return "进行中";
  },
  captureCount: (count) => `提子 ${count}`,
  move: (move) => {
    if (move.type === "move") {
      const captureText = move.captures > 0 ? `，提 ${move.captures} 子` : "";
      return `${move.number}. ${chineseColor(move.color)} ${move.coord}${captureText}`;
    }

    if (move.type === "pass") return `${move.number}. ${chineseColor(move.color)}虚手`;
    return `${move.number}. ${chineseColor(move.color)}认输`;
  },
  currentPlayer: (color) => `${chineseColor(color)}行棋`,
  winner: (color) => (color ? `${chineseColor(color)}胜` : "对局结束"),
  defaultStatus: (game) => {
    if (game.gameOver && game.result) return `结果：${game.result}。`;
    if (game.phase === "scoring") return "终局形势估算如下。";
    return "在任意空交叉点落子。";
  },
  status: (message) => {
    if (message.kind === "restored") return "已恢复保存的对局。";
    if (message.kind === "played") return `${chineseColor(message.color)}下在 ${message.coord}。`;
    if (message.kind === "bothPassed") {
      return `双方连续虚手。${chineseColor(message.winner)}领先 ${message.margin} 目。`;
    }
    if (message.kind === "passed") return `${chineseColor(message.color)}虚手。`;
    if (message.kind === "resigned") {
      return `${chineseColor(message.color)}认输。${chineseColor(message.winner)}胜。`;
    }
    if (message.kind === "undid") return "已撤销上一步。";
    if (message.kind === "newGame") return `新的 ${message.size} 路对局。`;
    return `当前估算：${chineseColor(message.winner)}领先 ${message.margin} 目。`;
  },
  legalMoveError: (reason) => {
    if (reason === "The game is not in a playing phase.") return "当前不在对局阶段。";
    if (reason === "That point is outside the board.") return "该点在棋盘外。";
    if (reason === "That intersection is occupied.") return "该交叉点已有棋子。";
    if (reason === "Suicide moves are not legal.") return "不能自杀。";
    if (reason === "That move repeats a previous board position.") return "该着会重复此前局面。";
    return reason;
  },
  confirm: {
    changeBoardSize: "更改棋盘大小会开始新对局。继续吗？",
    newGame: "开始新对局并清空棋盘？",
    resign: (color) => `${chineseColor(color)}要认输吗？`,
  },
  toast: {
    externalPlayer: (color) => `${chineseColor(color)}由外部玩家控制。`,
    noMovesToUndo: "没有可撤销的着法。",
    sgfDownloaded: "SGF 已下载。",
    sgfDownloadedAndCopied: "SGF 已下载并复制到剪贴板。",
    externalPlayerFailed: "外部玩家未能返回着法。",
  },
  scoreLabels: {
    blackTerritory: "黑方地域",
    whiteTerritory: "白方地域",
    blackTotal: "黑方总目",
    whiteTotal: "白方总目",
  },
};

export const translations: Record<Language, TranslationBundle> = {
  en: english,
  "zh-Hans": chinese,
};

export function useLanguagePreference() {
  const [language, setLanguage] = useState<Language>(() => {
    try {
      const stored = window.sessionStorage.getItem(LANGUAGE_STORAGE_KEY);
      return isLanguage(stored) ? stored : "en";
    } catch {
      return "en";
    }
  });

  useEffect(() => {
    document.documentElement.lang = language;

    try {
      window.sessionStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Session storage can be blocked by private browsing or strict browser settings.
    }
  }, [language]);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      toggleLanguage: () => setLanguage((current) => (current === "en" ? "zh-Hans" : "en")),
      t: translations[language],
    }),
    [language],
  );

  return value;
}

function isLanguage(value: string | null): value is Language {
  return value === "en" || value === "zh-Hans";
}
