/**
 * FR-108 知识点标签管理页（路由 /tags/manage）
 *
 * 功能：
 *  - 标签树展示（三级：科目/章节/知识点）
 *  - 创建/重命名/删除标签
 *  - 题目-标签绑定入口（从题目列表跳入）
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, Edit3, Tag, ArrowLeft, X } from 'lucide-react';
import { tagApi, buildTree, type TagTreeNode } from '../services/tagApi';

const LEVEL_LABELS = ['', '科目', '章节', '知识点'];

export function TagManagePage() {
  const navigate = useNavigate();
  const [tree, setTree] = useState<TagTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createLevel, setCreateLevel] = useState(1);
  const [createParentId, setCreateParentId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await tagApi.list();
      setTree(buildTree(res.tags));
    } catch (e: any) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCreate = async () => {
    if (!createName.trim()) return;
    try {
      await tagApi.create(createName.trim(), createLevel, createParentId);
      setShowCreate(false);
      setCreateName('');
      setError('');
      refresh();
    } catch (e: any) {
      setError(e.message || '创建失败');
    }
  };

  const handleRename = async (id: number) => {
    if (!editName.trim()) return;
    try {
      await tagApi.rename(id, editName.trim());
      setEditingId(null);
      refresh();
    } catch (e: any) {
      setError(e.message || '重命名失败');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此标签？子标签将提升一级。')) return;
    try {
      await tagApi.remove(id);
      refresh();
    } catch (e: any) {
      setError(e.message || '删除失败');
    }
  };

  const renderNode = (node: TagTreeNode, depth = 0) => (
    <div key={node.id} className="ml-0" style={{ marginLeft: depth * 20 }}>
      <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg hover:bg-slate-50 group">
        {depth < 2 && (
          <button
            onClick={() => {
              setCreateLevel(node.level + 1);
              setCreateParentId(node.id);
              setShowCreate(true);
            }}
            className="opacity-0 group-hover:opacity-100 text-emerald-500 hover:text-emerald-700 transition-opacity"
            title="添加子标签"
          >
            <Plus size={14} />
          </button>
        )}
        {editingId === node.id ? (
          <div className="flex items-center gap-1">
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRename(node.id)}
              className="border rounded px-2 py-0.5 text-sm w-40"
              autoFocus
            />
            <button onClick={() => handleRename(node.id)} className="text-blue-500 text-xs">保存</button>
            <button onClick={() => setEditingId(null)} className="text-gray-400 text-xs">取消</button>
          </div>
        ) : (
          <>
            <Tag size={14} className="text-indigo-400" />
            <span className="text-sm font-medium text-slate-700">{node.name}</span>
            <span className="text-xs text-slate-400">L{node.level} · {LEVEL_LABELS[node.level]}</span>
            <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => { setEditingId(node.id); setEditName(node.name); }}
                className="text-slate-400 hover:text-blue-500"
              >
                <Edit3 size={13} />
              </button>
              <button
                onClick={() => handleDelete(node.id)}
                className="text-slate-400 hover:text-red-500"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </>
        )}
      </div>
      {node.children.length > 0 && (
        <div>{node.children.map((c) => renderNode(c, depth + 1))}</div>
      )}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-slate-800">知识点标签管理</h1>
        <button
          onClick={() => { setCreateLevel(1); setCreateParentId(null); setShowCreate(true); }}
          className="ml-auto flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
        >
          <Plus size={14} /> 新建标签
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center justify-between">
          {error}
          <button onClick={() => setError('')}><X size={14} /></button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-400">加载中…</div>
      ) : tree.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          暂无标签，点击「新建标签」开始创建
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-1">
          {tree.map((node) => renderNode(node))}
        </motion.div>
      )}

      {/* 创建弹窗 */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
            onClick={() => setShowCreate(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-xl p-6 w-80 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-bold text-slate-800 mb-4">新建标签</h3>
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="标签名称"
                className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
              <div className="mb-4">
                <label className="text-xs text-slate-500">层级</label>
                <select
                  value={createLevel}
                  onChange={(e) => setCreateLevel(Number(e.target.value))}
                  className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                >
                  <option value={1}>科目 (L1)</option>
                  <option value={2}>章节 (L2)</option>
                  <option value={3}>知识点 (L3)</option>
                </select>
                {createParentId && (
                  <p className="text-xs text-slate-400 mt-1">
                    父标签 ID: {createParentId}
                  </p>
                )}
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg"
                >
                  取消
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!createName.trim()}
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  创建
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
