/* 本文件由 scripts/build-scoring.mjs 自动生成，请勿手动修改。修改请编辑 src/shared/scoring/index.ts 后重新生成。 */

"use strict";
var StudyScoring = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/shared/scoring/index.ts
  var index_exports = {};
  __export(index_exports, {
    correctOptionIndices: () => correctOptionIndices,
    formatTime: () => formatTime,
    gradeQuestion: () => gradeQuestion,
    isAnswerCorrect: () => isAnswerCorrect,
    scoreByIndices: () => scoreByIndices
  });
  function letterToIndex(label) {
    if (!/^[A-Z]$/.test(label.toUpperCase())) return -1;
    return label.toUpperCase().charCodeAt(0) - 65;
  }
  function optionIndexFromLabelOrText(options, answer) {
    if (!options) return -1;
    const s = String(answer != null ? answer : "").trim();
    const letterIdx = letterToIndex(s);
    if (letterIdx >= 0) return letterIdx;
    return options.findIndex((o) => (o == null ? void 0 : o.trim()) === s);
  }
  function correctOptionIndices(question) {
    const ans = question.answer;
    if (Array.isArray(ans)) {
      return ans.map((a) => optionIndexFromLabelOrText(question.options, a)).filter((i2) => i2 >= 0).sort((a, b) => a - b);
    }
    const i = optionIndexFromLabelOrText(question.options, ans);
    return i >= 0 ? [i] : [];
  }
  function isAnswerCorrect(q, userAns) {
    var _a;
    if (!userAns) return false;
    if (q.type === "single") {
      const uAns = typeof userAns === "string" ? userAns.trim() : String(userAns);
      const qAns = typeof q.answer === "string" ? q.answer.trim() : String(q.answer);
      if (uAns === qAns) return true;
      if (q.options && /^[A-Z]$/.test(qAns.toUpperCase())) {
        const labelIndex = qAns.toUpperCase().charCodeAt(0) - 65;
        if (((_a = q.options[labelIndex]) == null ? void 0 : _a.trim()) === uAns) return true;
      }
      return false;
    }
    if (q.type === "multiple") {
      const sortedUser = Array.isArray(userAns) ? [...userAns].map((s) => String(s).trim()).sort() : [];
      const qAns = q.answer;
      let targetAns = Array.isArray(qAns) ? [...qAns].map((s) => String(s).trim()).sort() : [];
      if (q.options && targetAns.every((a) => /^[A-Z]$/.test(a.toUpperCase()))) {
        targetAns = targetAns.map((label) => {
          var _a2;
          const idx = label.toUpperCase().charCodeAt(0) - 65;
          return ((_a2 = q.options[idx]) == null ? void 0 : _a2.trim()) || label;
        }).sort();
      }
      return sortedUser.length > 0 && JSON.stringify(sortedUser) === JSON.stringify(targetAns);
    }
    if (q.type === "programming") {
      const normalize = (s) => (s ? String(s) : "").replace(/\s+/g, "").replace(/['"]/g, '"').toLowerCase() || "";
      return normalize(userAns) === normalize(q.answer);
    }
    return false;
  }
  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }
  function gradeQuestion(question, userAnswer, points) {
    const pts = Number(points) || 0;
    if (question && question.type === "programming") {
      return { is_correct: null, earned: 0, needs_manual: true };
    }
    const isCorrect = isAnswerCorrect(question, userAnswer);
    return {
      is_correct: isCorrect,
      earned: isCorrect ? pts : 0,
      needs_manual: false
    };
  }
  function scoreByIndices(question, selectedIndices) {
    const sorted = [...selectedIndices || []].map(Number).sort((a, b) => a - b);
    if (question.type === "programming") {
      return isAnswerCorrect(question, sorted);
    }
    const correct = correctOptionIndices(question);
    return sorted.length === correct.length && sorted.every((v, i) => v === correct[i]);
  }
  return __toCommonJS(index_exports);
})();
