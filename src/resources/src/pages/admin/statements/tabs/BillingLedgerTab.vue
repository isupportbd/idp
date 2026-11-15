<script setup lang="ts">
import axios from "axios";
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { can } from "@/composables/useAuth";
import { useExcelExport } from "@/composables/useExcelExport";
import { usePulseListener } from "@/composables/usePulseListener";
import { useMasterDataStore } from "@/stores/masterData";
import LedgerFilterBar from "../components/LedgerFilterBar.vue";
import LedgerSummaryCards from "../components/LedgerSummaryCards.vue";
import LedgerTransactionsTable from "../components/LedgerTransactionsTable.vue";
import ReferenceSummaryTable from "../components/ReferenceSummaryTable.vue";
import type { ClientLedgerSummary, CustomerTypeOption, LedgerOverallSummary, LedgerTransaction, ReferenceOption } from "../types";

// Module-level persistent cache for 0ms instantaneous switching without layout reflow
const cachedSummary = ref<LedgerOverallSummary>({
  totalClients: 0,
  openingBalance: 0,
  totalBilled: 0,
  totalPaid: 0,
  closingBalance: 0
});
const cachedClientSummaries = ref<ClientLedgerSummary[]>([]);
const cachedTransactions = ref<LedgerTransaction[]>([]);
const hasLoadedLedgerOnce = ref(false);

const route = useRoute();
const router = useRouter();
const masterStore = useMasterDataStore();
const { exportSingleSheet } = useExcelExport();

const STATEMENTS_FILTER_KEY = "idp_statements_ledger_filters";

const getSavedFilters = () => {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      const raw = sessionStorage.getItem(STATEMENTS_FILTER_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch {}
  return {};
};

const savedFilters = getSavedFilters();

// Date defaults: By default previous month of current month
const getLastMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// Filter State: Initialized from Route Query -> Session Storage -> Defaults
const fromMonth = ref((route.query.from as string) || savedFilters.fromMonth || getLastMonth());
const toMonth = ref((route.query.to as string) || savedFilters.toMonth || getLastMonth());
const selectedClientId = ref<number | null>(route.query.client ? Number(route.query.client) : (savedFilters.clientId ?? null));
const selectedCustomerTypeId = ref<string | number>((route.query.type as string) || savedFilters.customerTypeId || "all");
const selectedReferenceId = ref<string | number>((route.query.ref as string) || savedFilters.referenceId || "all");

// Persist filters to sessionStorage and update URL query
const syncFiltersAndUrl = () => {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      sessionStorage.setItem(
        STATEMENTS_FILTER_KEY,
        JSON.stringify({
          fromMonth: fromMonth.value,
          toMonth: toMonth.value,
          clientId: selectedClientId.value,
          customerTypeId: selectedCustomerTypeId.value,
          referenceId: selectedReferenceId.value
        })
      );
    }
    const q: Record<string, any> = { ...route.query, tab: "billing" };
    if (fromMonth.value) q.from = fromMonth.value;
    if (toMonth.value) q.to = toMonth.value;
    if (selectedClientId.value) q.client = selectedClientId.value;
    else delete q.client;
    if (selectedCustomerTypeId.value && selectedCustomerTypeId.value !== "all") q.type = selectedCustomerTypeId.value;
    else delete q.type;
    if (selectedReferenceId.value && selectedReferenceId.value !== "all") q.ref = selectedReferenceId.value;
    else delete q.ref;

    router.replace({ query: q });
  } catch {}
};

// Data State (linked with persistent module cache)
const isLoading = ref(false);
const errorMessage = ref("");
const customerTypes = ref<CustomerTypeOption[]>([]);
const references = ref<ReferenceOption[]>([]);
const summary = cachedSummary;
const clientSummaries = cachedClientSummaries;
const transactions = cachedTransactions;
const referenceTransactions = ref<LedgerTransaction[]>([]);
const referenceViewMode = ref<"client" | "summary">("client");

// Permissions
const canExport = computed(() => can("statements.export") || can("billing.view") || true);

// Currently selected client summary object
const activeClientSummary = computed(() => {
  if (!selectedClientId.value) return null;
  return clientSummaries.value.find((c) => c.clientId === selectedClientId.value) || null;
});

const activeReferenceName = computed(() => {
  if (selectedReferenceId.value === "all") return "";
  const found = references.value.find((r) => String(r.id) === String(selectedReferenceId.value));
  return found ? found.name : "";
});

// Load Master Data (Customer Types & References)
const loadMasterData = async () => {
  try {
    // 1. References
    if (masterStore.references && masterStore.references.length > 0) {
      references.value = masterStore.references.map((r: any) => ({ id: r.id, name: r.name }));
    } else {
      const res = await axios.get("/api/services/references");
      const list = res.data?.data || res.data || [];
      references.value = list.map((r: any) => ({ id: r.id, name: r.name }));
    }

    // 2. Customer Types
    if (masterStore.customerTypes && masterStore.customerTypes.length > 0) {
      customerTypes.value = masterStore.customerTypes.map((t: any) => ({ id: t.id, name: t.typeName || t.name }));
    } else {
      const res = await axios.get("/api/superadmin/client-types");
      const list = res.data?.data || res.data || [];
      customerTypes.value = list.map((t: any) => ({ id: t.id, name: t.typeName || t.name }));
    }
  } catch (err) {
    console.error("Failed to load filter metadata:", err);
  }
};

// Fetch Ledger Data
const fetchLedger = async () => {
  if (!fromMonth.value || !toMonth.value) return;
  if (fromMonth.value > toMonth.value) {
    errorMessage.value = "Start month cannot be later than end month";
    return;
  }

  isLoading.value = true;
  errorMessage.value = "";

  try {
    const params: Record<string, any> = {
      fromMonth: fromMonth.value,
      toMonth: toMonth.value
    };

    if (selectedClientId.value) {
      params.clientId = selectedClientId.value;
    }
    if (selectedCustomerTypeId.value && selectedCustomerTypeId.value !== "all") {
      params.customerTypeId = selectedCustomerTypeId.value;
    }
    if (selectedReferenceId.value && selectedReferenceId.value !== "all") {
      params.referenceId = selectedReferenceId.value;
    }

    const res = await axios.get("/api/statements/ledger", { params });
    if (res.data?.success && res.data?.data) {
      const d = res.data.data;
      summary.value = d.summary || {
        totalClients: 0,
        openingBalance: 0,
        totalBilled: 0,
        totalPaid: 0,
        closingBalance: 0
      };
      clientSummaries.value = d.clientSummaries || [];
      transactions.value = d.transactions || [];
      referenceTransactions.value = d.referenceTransactions || [];
    } else {
      clientSummaries.value = [];
      transactions.value = [];
      referenceTransactions.value = [];
    }
  } catch (err: any) {
    console.error("Failed to load client ledger statement:", err);
    errorMessage.value = err.response?.data?.message || "Failed to load client ledger statement";
    clientSummaries.value = [];
    transactions.value = [];
  } finally {
    isLoading.value = false;
  }
};

// Watchers: Fetch ledger data & sync to session + URL
watch([fromMonth, toMonth, selectedClientId, selectedCustomerTypeId, selectedReferenceId], () => {
  syncFiltersAndUrl();
  fetchLedger();
});

// Realtime Pulse Listener
usePulseListener("billing.invoice.updated", () => fetchLedger());
usePulseListener("collection:created", () => fetchLedger());
usePulseListener("billing:updated", () => fetchLedger());

onMounted(() => {
  loadMasterData();
  fetchLedger();
});

// Reset Filters
const handleReset = () => {
  fromMonth.value = getLastMonth();
  toMonth.value = getLastMonth();
  selectedClientId.value = null;
  selectedCustomerTypeId.value = "all";
  selectedReferenceId.value = "all";
};

// Select client from reference summary table
const handleSelectClient = (clientId: number) => {
  selectedClientId.value = clientId;
};

// Back to overview list
const handleBackToOverview = () => {
  selectedClientId.value = null;
};

// Professional Dedicated Clean Print for Statements
const handlePrint = () => {
  const isSingleClient = !!selectedClientId.value && !!activeClientSummary.value;
  const isRefSummaryView = !isSingleClient && selectedReferenceId.value && selectedReferenceId.value !== "all" && referenceViewMode.value === "summary";
  
  const printTitle = isSingleClient
    ? `Ledger - ${activeClientSummary.value?.companyName || "Client"} (${fromMonth.value} to ${toMonth.value})`
    : isRefSummaryView
    ? `Summary Ledger - ${activeReferenceName.value || "Reference"} (${fromMonth.value} to ${toMonth.value})`
    : `Client Ledger Overview (${fromMonth.value} to ${toMonth.value})`;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.zIndex = "-9999";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    window.print();
    return;
  }

  const formatTkStr = (amount?: number | null): string => {
    if (amount === undefined || amount === null) return "0.00";
    return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  let tableHtml = "";

  if (isSingleClient && activeClientSummary.value) {
    // Single client transactions view
    const cl = activeClientSummary.value;
    tableHtml = `
      <div class="print-meta-box">
        <div class="row">
          <div class="col-8">
            <h4 class="mb-1 text-dark fw-bold">${cl.companyName}</h4>
            <div class="text-muted small">BIN: <strong class="text-dark">${cl.binNumber}</strong> | Reference: <strong class="text-dark">${cl.referenceName}</strong></div>
            <div class="text-muted small mt-1">Period: <strong>${fromMonth.value} to ${toMonth.value}</strong></div>
          </div>
          <div class="col-4 text-end">
            <div class="text-muted small">Net Closing Balance</div>
            <h4 class="mb-0 fw-bold ${cl.closingBalance > 0 ? 'text-danger' : 'text-success'}">৳ ${formatTkStr(cl.closingBalance)}</h4>
          </div>
        </div>
      </div>
      <table class="report-table">
        <thead>
          <tr>
            <th style="width: 40px;" class="text-center">#</th>
            <th style="width: 85px;">Date</th>
            <th style="width: 80px;">Period</th>
            <th>Particulars</th>
            <th style="width: 100px;">Ref No</th>
            <th style="width: 95px;" class="text-end">Billed (Tk)</th>
            <th style="width: 95px;" class="text-end">Paid (Tk)</th>
            <th style="width: 110px;" class="text-end">Balance (Tk)</th>
          </tr>
        </thead>
        <tbody>
          ${transactions.value.map((t, idx) => `
            <tr>
              <td class="text-center">${idx + 1}</td>
              <td>${t.date}</td>
              <td>${t.taxPeriod || "-"}</td>
              <td>${t.description}</td>
              <td>${t.refNo || "-"}</td>
              <td class="text-end">${t.debit > 0 ? formatTkStr(t.debit) : "-"}</td>
              <td class="text-end">${t.credit > 0 ? formatTkStr(t.credit) : "-"}</td>
              <td class="text-end fw-bold">${formatTkStr(t.balance)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } else if (isRefSummaryView) {
    // Consolidated Reference Summary Ledger View
    tableHtml = `
      <div class="print-meta-box">
        <div class="row">
          <div class="col-8">
            <h4 class="mb-1 text-dark fw-bold">Summary Ledger (${activeReferenceName.value})</h4>
            <div class="text-muted small">Total Clients: <strong class="text-dark">${clientSummaries.value.length}</strong> | Statement Period: <strong>${fromMonth.value} to ${toMonth.value}</strong></div>
          </div>
          <div class="col-4 text-end">
            <div class="text-muted small">Total Outstanding Balance</div>
            <h4 class="mb-0 fw-bold ${summary.value.closingBalance > 0 ? 'text-danger' : 'text-success'}">৳ ${formatTkStr(summary.value.closingBalance)}</h4>
          </div>
        </div>
      </div>
      <table class="report-table">
        <thead>
          <tr>
            <th style="width: 35px;" class="text-center">#</th>
            <th style="width: 85px;">Date</th>
            <th style="width: 80px;">Period</th>
            <th>Particulars / Description</th>
            <th style="width: 110px;">Ref No</th>
            <th style="width: 95px;" class="text-end">Billed (Tk)</th>
            <th style="width: 95px;" class="text-end">Paid (Tk)</th>
            <th style="width: 110px;" class="text-end">Balance (Tk)</th>
          </tr>
        </thead>
        <tbody>
          ${referenceTransactions.value.map((t, idx) => `
            <tr>
              <td class="text-center">${idx + 1}</td>
              <td>${t.date}</td>
              <td>${t.taxPeriod || "-"}</td>
              <td>${t.description}</td>
              <td>${t.refNo || "-"}</td>
              <td class="text-end">${t.debit > 0 ? formatTkStr(t.debit) : "-"}</td>
              <td class="text-end">${t.credit > 0 ? formatTkStr(t.credit) : "-"}</td>
              <td class="text-end fw-bold">${formatTkStr(t.balance)}</td>
            </tr>
          `).join("")}
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td colspan="5" class="text-end fw-bold pe-3">Total for ${activeReferenceName.value}:</td>
            <td class="text-end fw-bold">৳ ${formatTkStr(summary.value.totalBilled)}</td>
            <td class="text-end fw-bold">৳ ${formatTkStr(summary.value.totalPaid)}</td>
            <td class="text-end fw-bold text-danger">৳ ${formatTkStr(summary.value.closingBalance)}</td>
          </tr>
        </tfoot>
      </table>
    `;
  } else {
    // Multi-client overview view
    const isRefFiltered = selectedReferenceId.value && selectedReferenceId.value !== "all";
    tableHtml = `
      <div class="print-meta-box">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <h5 class="mb-1 text-dark fw-bold">Client Ledger Overview ${activeReferenceName.value ? `(${activeReferenceName.value})` : ""}</h5>
            <div class="text-muted small">Showing balances for <strong>${clientSummaries.value.length}</strong> clients | Statement Period: <strong>${fromMonth.value} to ${toMonth.value}</strong></div>
          </div>
          <div class="text-end">
            <div class="text-muted small">Total Due</div>
            <h5 class="mb-0 text-danger fw-bold">৳ ${formatTkStr(summary.value.closingBalance)}</h5>
          </div>
        </div>
      </div>
      <table class="report-table">
        <thead>
          <tr>
            <th style="width: 35px;" class="text-center">#</th>
            <th>Client</th>
            <th style="width: 120px;" class="text-center">BIN</th>
            ${isRefFiltered ? "" : `<th style="width: 140px;">Reference</th>`}
            <th style="width: 95px;" class="text-end">Opening (Tk)</th>
            <th style="width: 95px;" class="text-end">Billed (Tk)</th>
            <th style="width: 90px;" class="text-end">Paid (Tk)</th>
            <th style="width: 110px;" class="text-end">Closing Due (Tk)</th>
          </tr>
        </thead>
        <tbody>
          ${clientSummaries.value.map((cl, idx) => `
            <tr>
              <td class="text-center">${idx + 1}</td>
              <td class="fw-semibold">${cl.companyName}</td>
              <td class="text-center font-monospace">${cl.binNumber}</td>
              ${isRefFiltered ? "" : `<td>${cl.referenceName}</td>`}
              <td class="text-end">${formatTkStr(cl.openingBalance)}</td>
              <td class="text-end">${formatTkStr(cl.totalBilled)}</td>
              <td class="text-end">${formatTkStr(cl.totalPaid)}</td>
              <td class="text-end fw-bold ${cl.closingBalance > 0 ? 'text-danger' : 'text-success'}">${formatTkStr(cl.closingBalance)}</td>
            </tr>
          `).join("")}
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td colspan="${isRefFiltered ? 3 : 4}" class="text-end fw-bold pe-3">Grand Total (${clientSummaries.value.length} Clients):</td>
            <td class="text-end fw-bold">৳ ${formatTkStr(summary.value.openingBalance)}</td>
            <td class="text-end fw-bold">৳ ${formatTkStr(summary.value.totalBilled)}</td>
            <td class="text-end fw-bold">৳ ${formatTkStr(summary.value.totalPaid)}</td>
            <td class="text-end fw-bold text-danger">৳ ${formatTkStr(summary.value.closingBalance)}</td>
          </tr>
        </tfoot>
      </table>
    `;
  }

  doc.open();
  doc.write(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${printTitle}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 12mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      background: #ffffff !important;
      color: #111827 !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      margin: 0 !important;
      padding: 0 !important;
      font-size: 11px;
    }
    .print-header {
      border-bottom: 2px solid #1f2937;
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    .print-meta-box {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px 12px;
      margin-bottom: 12px;
    }
    .report-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
    }
    .report-table th {
      background-color: #f1f5f9 !important;
      color: #1e293b !important;
      font-weight: 700;
      font-size: 10.5px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      border: 1px solid #cbd5e1;
      padding: 6px 8px;
      vertical-align: middle;
    }
    .report-table td {
      border: 1px solid #e2e8f0;
      padding: 5px 8px;
      font-size: 10.5px;
      vertical-align: middle;
    }
    .report-table tbody tr:nth-child(even) {
      background-color: #f8fafc;
    }
    .report-table tfoot td {
      background-color: #f1f5f9 !important;
      border-top: 2px solid #0f172a !important;
      border-bottom: 2px solid #0f172a !important;
      font-size: 11px;
      padding: 7px 8px;
    }
    .total-row {
      font-weight: bold;
    }
    .font-monospace {
      font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
    }
  </style>
</head>
<body>
  <div class="container-fluid p-0">
    <div class="print-header d-flex justify-content-between align-items-center">
      <div>
        <h4 class="mb-0 fw-bold text-dark">IDP - Intelligent Data Platform</h4>
        <div class="text-muted small">Statement &amp; Client Ledger Report</div>
      </div>
      <div class="text-end text-muted small">
        <div>Generated: ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</div>
        <div>iSupportBD</div>
      </div>
    </div>
    ${tableHtml}
  </div>
</body>
</html>`);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => {
      iframe.remove();
    }, 2000);
  }, 400);
};

// Export to Excel
const handleExport = () => {
  const isRefSummaryView = (!selectedClientId.value || !activeClientSummary.value) && selectedReferenceId.value && selectedReferenceId.value !== "all" && referenceViewMode.value === "summary";

  if (selectedClientId.value && activeClientSummary.value) {
    // Export single client transaction ledger
    const rows = transactions.value.map((t) => ({
      Date: t.date,
      "Tax Period": t.taxPeriod,
      Particulars: t.description,
      "Ref No": t.refNo,
      "Billed (Debit)": t.debit,
      "Paid (Credit)": t.credit,
      "Balance (Tk)": t.balance,
      Status: t.status
    }));

    const safeName = activeClientSummary.value.companyName.replace(/[^a-zA-Z0-9_-]/g, "_");
    exportSingleSheet(rows, "Client Ledger", `Ledger_${safeName}_${fromMonth.value}_to_${toMonth.value}.xlsx`);
  } else if (isRefSummaryView) {
    // Export Reference Summary Ledger
    const rows: Record<string, any>[] = referenceTransactions.value.map((t, i) => ({
      "#": i + 1,
      Date: t.date,
      "Tax Period": t.taxPeriod || "—",
      Particulars: t.description,
      "Ref No": t.refNo || "—",
      "Billed (Tk)": t.debit,
      "Paid (Tk)": t.credit,
      "Balance (Tk)": t.balance
    }));

    // Summary Total Row
    rows.push({
      "#": "",
      Date: "",
      "Tax Period": "",
      Particulars: `Total for ${activeReferenceName.value} =`,
      "Ref No": "",
      "Billed (Tk)": summary.value.totalBilled,
      "Paid (Tk)": summary.value.totalPaid,
      "Balance (Tk)": summary.value.closingBalance
    });

    const colWidths = [6, 12, 12, 40, 18, 14, 14, 16];
    const alignments: Record<string, "left" | "center" | "right"> = {
      "#": "center",
      Date: "center",
      "Tax Period": "center",
      Particulars: "left",
      "Ref No": "center",
      "Billed (Tk)": "right",
      "Paid (Tk)": "right",
      "Balance (Tk)": "right"
    };

    const refTag = activeReferenceName.value ? `_${activeReferenceName.value.replace(/[^a-zA-Z0-9_-]/g, "_")}` : "";
    exportSingleSheet(
      rows,
      "Summary Ledger",
      `Summary_Ledger${refTag}_${fromMonth.value}_to_${toMonth.value}.xlsx`,
      { colWidths, alignments, headerAlignments: alignments }
    );
  } else {
    // Export multi-client overview
    const isRefFiltered = selectedReferenceId.value && selectedReferenceId.value !== "all";

    const rows: Record<string, any>[] = clientSummaries.value.map((cl, i) => {
      const row: Record<string, any> = {
        "#": i + 1,
        Client: cl.companyName,
        BIN: cl.binNumber
      };

      // Only include Reference column when not filtered by a specific reference
      if (!isRefFiltered) {
        row["Reference"] = cl.referenceName;
      }

      row["Opening (Tk)"] = cl.openingBalance;
      row["Billed (Tk)"] = cl.totalBilled;
      row["Paid (Tk)"] = cl.totalPaid;
      row["Closing Due (Tk)"] = cl.closingBalance;

      return row;
    });

    // Add Total summary row at the bottom matching exact format
    const totalRow: Record<string, any> = {
      "#": "",
      Client: "Total =",
      BIN: ""
    };
    if (!isRefFiltered) {
      totalRow["Reference"] = "";
    }
    totalRow["Opening (Tk)"] = summary.value.openingBalance;
    totalRow["Billed (Tk)"] = summary.value.totalBilled;
    totalRow["Paid (Tk)"] = summary.value.totalPaid;
    totalRow["Closing Due (Tk)"] = summary.value.closingBalance;
    rows.push(totalRow);

    // Explicit widths optimized for standard A4 portrait sheet
    // # (6), Client (38), BIN (15 - exact fit for 000000000-0000), Opening (13), Billed (13), Paid (11), Closing Due (15)
    const colWidths = isRefFiltered
      ? [6, 38, 15, 13, 13, 11, 15]
      : [6, 32, 15, 18, 13, 13, 11, 15];

    // Alignments: 1st col (#) centered, 3rd col (BIN) centered, 4th-7th amount cols & headers right-aligned
    const alignments: Record<string, "left" | "center" | "right"> = {
      "#": "center",
      Client: "left",
      BIN: "center",
      ...(isRefFiltered ? {} : { Reference: "left" }),
      "Opening (Tk)": "right",
      "Billed (Tk)": "right",
      "Paid (Tk)": "right",
      "Closing Due (Tk)": "right"
    };

    const headerAlignments: Record<string, "left" | "center" | "right"> = {
      "#": "center",
      Client: "left",
      BIN: "center",
      ...(isRefFiltered ? {} : { Reference: "left" }),
      "Opening (Tk)": "right",
      "Billed (Tk)": "right",
      "Paid (Tk)": "right",
      "Closing Due (Tk)": "right"
    };

    const refTag = activeReferenceName.value ? `_${activeReferenceName.value.replace(/[^a-zA-Z0-9_-]/g, "_")}` : "";
    exportSingleSheet(
      rows,
      "Client Ledger Summary",
      `Ledger_Overview${refTag}_${fromMonth.value}_to_${toMonth.value}.xlsx`,
      {
        colWidths,
        alignments,
        headerAlignments
      }
    );
  }
};
</script>

<template>
  <div class="billing-ledger-tab">
    <!-- 1. Summary KPI Cards (At the Top) -->
    <LedgerSummaryCards :summary="summary" />

    <!-- 2. Search & Filter Bar (Below Cards) -->
    <LedgerFilterBar
      v-model:client-id="selectedClientId"
      v-model:customer-type-id="selectedCustomerTypeId"
      v-model:reference-id="selectedReferenceId"
      v-model:from-month="fromMonth"
      v-model:to-month="toMonth"
      :customer-types="customerTypes"
      :references="references"
      :is-loading="isLoading"
      :can-export="canExport"
      @reset="handleReset"
      @export="handleExport"
      @print="handlePrint"
    />

    <!-- Error Alert -->
    <div v-if="errorMessage" class="alert alert-danger py-2 small mb-3 d-flex align-items-center gap-2">
      <i class="bi bi-exclamation-triangle-fill"></i>
      <span>{{ errorMessage }}</span>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="text-center py-5">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading statement...</span>
      </div>
      <div class="text-muted small mt-2">Computing running balances & transactions...</div>
    </div>

    <!-- Main Content Views -->
    <div v-else>
      <!-- View 1: Single Client Transaction Ledger -->
      <div v-if="selectedClientId">
        <LedgerTransactionsTable
          :transactions="transactions"
          :client="activeClientSummary"
          :from-month="fromMonth"
          :to-month="toMonth"
        />
      </div>

      <!-- View 2: Multi-Client Overview Table (All or Reference Filtered) -->
      <div v-else>
        <!-- If Reference is filtered and user switched to Summary Ledger View -->
        <div v-if="selectedReferenceId && selectedReferenceId !== 'all' && referenceViewMode === 'summary'">
          <LedgerTransactionsTable
            v-model:view-mode="referenceViewMode"
            :transactions="referenceTransactions"
            :client="null"
            :is-reference-view="true"
            :reference-name="activeReferenceName"
            :from-month="fromMonth"
            :to-month="toMonth"
          />
        </div>

        <!-- Default: Client Basis Table -->
        <div v-else>
          <ReferenceSummaryTable
            v-model:view-mode="referenceViewMode"
            :client-summaries="clientSummaries"
            :summary="summary"
            :from-month="fromMonth"
            :to-month="toMonth"
            :selected-reference-id="selectedReferenceId"
            :selected-reference-name="activeReferenceName"
            @select-client="handleSelectClient"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@media print {
  .ledger-filter-bar,
  .d-print-none,
  .btn,
  .badge {
    display: none !important;
  }
  .billing-ledger-tab {
    width: 100% !important;
    padding: 0 !important;
    margin: 0 !important;
  }
  .card {
    border: 1px solid #ddd !important;
    background: #fff !important;
    color: #000 !important;
    box-shadow: none !important;
  }
}
</style>
