import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { AudioPlayer } from '../AudioPlayer';
import { mediaApi } from '../../services/api';

vi.mock('../../services/api', () => ({
  mediaApi: { fetchBlob: vi.fn() },
}));

describe('AudioPlayer (FR-105)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (URL.createObjectURL as unknown) = vi.fn(() => 'blob:mock');
    (URL.revokeObjectURL as unknown) = vi.fn();
    (mediaApi.fetchBlob as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Blob(['x'], { type: 'audio/mpeg' }));
  });

  it('加载后渲染 <audio controls> 且 src 为 objectURL', async () => {
    render(<AudioPlayer src="/api/uploads/user_1/a.mp3" />);
    await waitFor(() => expect(mediaApi.fetchBlob).toHaveBeenCalledWith('/api/uploads/user_1/a.mp3'));
    const el = await screen.findByTestId('audio-player');
    expect(el.getAttribute('src')).toBe('blob:mock');
    expect(el.hasAttribute('controls')).toBe(true);
  });

  it('拉取失败展示错误态', async () => {
    (mediaApi.fetchBlob as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('403'));
    render(<AudioPlayer src="/api/uploads/user_1/a.mp3" />);
    await waitFor(() => expect(screen.getByText(/加载失败/)).toBeInTheDocument());
  });
});
