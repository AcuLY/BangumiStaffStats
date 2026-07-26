import {
  BUDGETS_PATH,
  MATRIX_PATH,
  ORACLE_EXCEPTIONS_PATH,
  REPOSITORY_ROOT,
} from './constants.mjs';
import {
  validateBudgets,
  validateMatrix,
  validateOracleExceptions,
} from './contracts.mjs';
import { readJsonStrict } from './strict-json.mjs';

export function loadAcceptanceConfiguration() {
  const matrix = validateMatrix(readJsonStrict(MATRIX_PATH));
  const budgets = validateBudgets(readJsonStrict(BUDGETS_PATH));
  const oracleExceptions = validateOracleExceptions(
    readJsonStrict(ORACLE_EXCEPTIONS_PATH),
    { authorityRoot: REPOSITORY_ROOT },
  );
  return Object.freeze({ matrix, budgets, oracleExceptions });
}
