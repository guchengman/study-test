/**
 * FR-108 知识点标签体系前端 API
 *
 * 端点：/api/tags
 */
import client from './api';

// ─── 类型 ──────────────────────────────────────────────────

export interface TagItem {
  id: number;
  org_id: number | null;
  name: string;
  parent_id: number | null;
  level: number;
  created_at: string;
}

export interface TagTreeNode extends TagItem {
  children: TagTreeNode[];
}

// ─── API ───────────────────────────────────────────────────

export const tagApi = {
  /** GET /api/tags/tree — 当前用户标签列表 */
  list: () => client.get<{ tags: TagItem[] }>('/tags/tree'),

  /** POST /api/tags — 创建标签 */
  create: (name: string, level: number, parentId?: number | null) =>
    client.post<{ id: number }>('/tags', { name, level, parent_id: parentId ?? null }),

  /** PUT /api/tags/:id — 重命名 */
  rename: (id: number, name: string) =>
    client.put<{ ok: boolean }>(`/tags/${id}`, { name }),

  /** DELETE /api/tags/:id — 删除 */
  remove: (id: number) =>
    client.delete<{ ok: boolean }>(`/tags/${id}`),

  /** POST /api/tags/question/:qid/bindTags — 题目绑定标签 */
  bindTags: (questionId: number, tagIds: number[]) =>
    client.post<{ added: number }>(`/tags/question/${questionId}/bindTags`, { tag_ids: tagIds }),

  /** DELETE /api/tags/question/:qid/unbindTag/:tagId — 解绑 */
  unbindTag: (questionId: number, tagId: number) =>
    client.delete<{ ok: boolean }>(`/tags/question/${questionId}/unbindTag/${tagId}`),

  /** GET /api/tags/question/:qid — 获取题目已有标签 */
  getForQuestion: (questionId: number) =>
    client.get<{ tags: TagItem[] }>(`/tags/question/${questionId}`),
};

// ─── 工具 ───────────────────────────────────────────────────

/** 把扁平列表组装成树（仅 1~3 层） */
export function buildTree(tags: TagItem[]): TagTreeNode[] {
  const map = new Map<number, TagTreeNode>();
  const roots: TagTreeNode[] = [];
  for (const t of tags) {
    map.set(t.id, { ...t, children: [] });
  }
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}
