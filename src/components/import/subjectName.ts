// 科目显示名查表（纯函数，从 ImportModal 抽取，消除审计示例 3 的重复）
import type { Subject, SubjectId } from '../../types';

const FALLBACK: Record<string, string> = {
  python: 'Python',
  english: '英语',
  chinese: '语文',
  math: '数学',
};

function fallbackName(base: string): string {
  return FALLBACK[base] || base;
}

// 根据原始科目名获取显示名称
export function getSubjectDisplayName(
  allSubjects: Subject[] | undefined,
  subjectName: string | null
): string {
  if (!subjectName) return '未知';
  const mySubjects = (allSubjects || []).filter((s) => s.isOwner !== false);
  const matched = mySubjects.find(
    (s) =>
      s.id === subjectName ||
      s.id.replace(/_\d+$/, '') === subjectName ||
      s.name.toLowerCase().includes(subjectName.toLowerCase())
  );
  return matched?.name || fallbackName(subjectName);
}

// 根据科目ID获取显示名称
export function getSubjectDisplayNameById(
  allSubjects: Subject[] | undefined,
  subjectId: string | null
): string {
  if (!subjectId) return '未知';
  const mySubjects = (allSubjects || []).filter((s) => s.isOwner !== false);
  const matched = mySubjects.find((s) => s.id === subjectId);
  if (matched) return matched.name;
  const baseName = subjectId.replace(/_\d+$/, '');
  return fallbackName(baseName);
}

// 仅保留"自己创建的科目"（排除别人共享给自己的）
export function myOwnedSubjects(allSubjects: Subject[] | undefined): Subject[] {
  return (allSubjects || []).filter((s) => s.isOwner !== false);
}

export type { SubjectId };
