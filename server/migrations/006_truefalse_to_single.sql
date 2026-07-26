-- 迁移：将 true/false 类型题目统一转为 single + options=['正确','错误']
-- 判断题不再作为独立类型，统一用 single + 选项 ['正确', '错误'] + answer 'A'/'B' 表示

UPDATE questions 
SET type = 'single',
    options = '["正确", "错误"]',
    answer = CASE 
      WHEN JSON_UNQUOTE(answer) IN ('"正确"', '"true"', '"对"', '"yes"', '"√"', '"是"', '"A"', '"a"', '"1"') THEN '"A"'
      WHEN JSON_UNQUOTE(answer) IN ('"错误"', '"false"', '"错"', '"no"', '"×"', '"否"', '"B"', '"b"', '"0"') THEN '"B"'
      ELSE '"A"'
    END
WHERE type = 'true/false';
