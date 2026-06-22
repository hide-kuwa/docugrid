export type PayrollEmployee = {
  id: string;
  client_id: string;
  employee_code: string | null;
  name: string;
  hire_date: string | null;
  tax_column: "甲" | "乙";
  dependent_count: number;
  spouse_deduction: boolean;
  social_insurance_grade: number | null;
  notes: string | null;
  active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export type WithholdingLedgerRow = {
  id: string;
  client_id: string;
  employee_id: string;
  year_month: string;
  gross_pay_yen: number;
  bonus_yen: number;
  health_insurance_yen: number;
  pension_yen: number;
  employment_insurance_yen: number;
  income_tax_yen: number;
  resident_tax_yen: number;
  net_pay_yen: number;
  notes: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type LedgerSummary = {
  year_month: string;
  row_count: number;
  totals: Record<string, number>;
};

export type YearEndEmployeeResult = {
  employee_id: string;
  employee_name: string | null;
  annual_payment_yen: number;
  annual_withheld_yen: number;
  annual_tax_yen: number;
  settlement_yen: number;
  settlement_type: "collect" | "refund" | "even";
  taxable_income_yen: number;
  marufu_applied?: boolean;
};

export type YearEndRun = {
  id: string;
  client_id: string;
  tax_year: number;
  status: string;
  settlement_month: string | null;
  result: {
    tax_year: number;
    employee_count: number;
    total_collect_yen: number;
    total_refund_yen: number;
    employees: YearEndEmployeeResult[];
  } | null;
  applied_at: string | null;
  created_at: string;
  created_by: string | null;
};
