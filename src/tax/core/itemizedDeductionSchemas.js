/* TAX ENGINE — itemized deduction input schemas (shapes only). */

export const MEDICAL_EXPENSE_DEDUCTION_INPUT_SCHEMA = {
  fields: {
    adjustedGrossIncome: 'number',
    medicalExpenses: 'number',
  },
  required: ['adjustedGrossIncome', 'medicalExpenses'],
};

export const SALT_DEDUCTION_CAP_INPUT_SCHEMA = {
  fields: {
    filingStatus: 'string',
    enteredSaltTotal: 'number',
  },
  required: ['filingStatus', 'enteredSaltTotal'],
};
