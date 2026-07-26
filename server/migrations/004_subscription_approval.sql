-- 4. 给 subject_subscriptions 添加审核状态字段
ALTER TABLE subject_subscriptions ADD COLUMN status VARCHAR(10) DEFAULT 'approved' AFTER subscribed_at;

-- 将现有订阅全部设为已通过
UPDATE subject_subscriptions SET status = 'approved' WHERE status IS NULL;
