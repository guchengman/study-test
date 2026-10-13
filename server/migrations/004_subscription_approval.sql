-- 4. 给 subject_subscriptions 添加审核状态字段
-- 幂等化：全新库 001 已含 status 列，用守卫保证空库全量重放可贯通；存量库不重放。
SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subject_subscriptions' AND COLUMN_NAME = 'status');
SET @s = IF(@c = 0,
  'ALTER TABLE subject_subscriptions ADD COLUMN status VARCHAR(10) DEFAULT ''approved'' AFTER subscribed_at',
  'SELECT "subject_subscriptions.status already exists" AS msg');
PREPARE st FROM @s;
EXECUTE st;
DEALLOCATE PREPARE st;

-- 将现有订阅全部设为已通过
UPDATE subject_subscriptions SET status = 'approved' WHERE status IS NULL;
