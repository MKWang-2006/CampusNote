-- Test helpers for the SQL check files. Loaded into the throwaway check database only.
--   CALL t_eq('name', actual, 'expected');        prints PASS/FAIL (NULL-safe comparison)
--   CALL t_err('name', 'SQL statement', errno);   runs the statement, expects that MySQL error
-- Common error numbers: 1062 duplicate key, 1452 foreign key, 3819 CHECK constraint,
-- 1644 SIGNAL from a trigger, 1048 NOT NULL. A bad ENUM value (1265) has a warning SQLSTATE
-- even in strict mode, so t_err cannot catch it; check the column's allowed values instead.
DROP PROCEDURE IF EXISTS t_eq;
DROP PROCEDURE IF EXISTS t_err;
DELIMITER $$
CREATE PROCEDURE t_eq(IN p_name VARCHAR(200), IN p_actual TEXT, IN p_expected TEXT)
BEGIN
  SELECT IF(p_actual <=> p_expected,
            CONCAT('PASS  ', p_name),
            CONCAT('FAIL  ', p_name, '   expected [', IFNULL(p_expected, 'NULL'), '] got [', IFNULL(p_actual, 'NULL'), ']')) AS result;
END$$
CREATE PROCEDURE t_err(IN p_name VARCHAR(200), IN p_sql TEXT, IN p_errno INT)
BEGIN
  DECLARE v_errno INT DEFAULT 0;
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION GET DIAGNOSTICS CONDITION 1 v_errno = MYSQL_ERRNO;
  SET @t_sql = p_sql;
  PREPARE t_stmt FROM @t_sql;
  IF v_errno = 0 THEN
    EXECUTE t_stmt;
    DEALLOCATE PREPARE t_stmt;
  END IF;
  SELECT IF(v_errno = p_errno,
            CONCAT('PASS  ', p_name),
            CONCAT('FAIL  ', p_name, '   expected error ', p_errno, ' got ', v_errno)) AS result;
END$$
DELIMITER ;
