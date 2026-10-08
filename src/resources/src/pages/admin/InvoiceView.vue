<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useBillingApi } from "@/composables/useBillingApi";
import { useToast } from "@/composables/useToast";

const route = useRoute();
const router = useRouter();
const toast = useToast();
const { fetchBillDetails } = useBillingApi();

const billId = Number(route.params.id);
const loading = ref(true);
const bill = ref<any>(null);
const isGeneratingJpg = ref(false);
const isSharingWa = ref(false);

const paymentDueDate = computed(() => {
  if (!bill.value) return "";
  if (bill.value.dueDate) {
    return new Date(bill.value.dueDate).toLocaleDateString();
  }
  if (bill.value.billDate) {
    const d = new Date(bill.value.billDate);
    d.setDate(d.getDate() + 7);
    return d.toLocaleDateString();
  }
  return "";
});

onMounted(async () => {
  if (!billId || isNaN(billId)) {
    loading.value = false;
    return;
  }
  try {
    const data = await fetchBillDetails(billId);
    bill.value = data;
    if (data?.billNo) {
      document.title = `Invoice ${data.billNo} — ${data.clientName || 'IDP'}`;
    }
  } catch (err) {
    // Handled in composable
  } finally {
    loading.value = false;
  }
});

const formatWhatsAppNumber = (rawNumber?: string) => {
  if (!rawNumber) return "";
  const digits = rawNumber.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("880")) return digits;
  if (digits.startsWith("0")) return "88" + digits;
  if (digits.length === 10 && digits.startsWith("1")) return "880" + digits;
  return digits;
};

// Render invoice DOM into high-res JPG Blob
const captureInvoiceBlob = async (): Promise<{ blob: Blob; filename: string } | null> => {
  const el = document.getElementById("printable-invoice");
  if (!el) return null;

  try {
    const html2canvas = (await import("html2canvas-pro")).default;
    const canvas = await html2canvas(el, {
      scale: 2.5,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      windowWidth: 860
    });
    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Image blob creation failed"))), "image/jpeg", 0.95);
    });
    const filename = `${(bill.value?.billNo || "invoice").replace(/[/\\]/g, "-")}.jpg`;
    return { blob, filename };
  } catch (err) {
    console.error("html2canvas error:", err);
    return null;
  }
};

const jpgToPng = async (jpgBlob: Blob): Promise<Blob> => {
  const url = URL.createObjectURL(jpgBlob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG blob failed"))), "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
};

const handleDownloadJpg = async () => {
  if (isGeneratingJpg.value) return;
  isGeneratingJpg.value = true;
  try {
    const captured = await captureInvoiceBlob();
    if (!captured) {
      toast.error("Failed to generate JPG image");
      return;
    }
    const url = URL.createObjectURL(captured.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = captured.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast.success("Invoice JPG downloaded successfully");
  } catch (err) {
    toast.error("Failed to download JPG");
  } finally {
    isGeneratingJpg.value = false;
  }
};

const handleWhatsAppShare = async () => {
  if (!bill.value || isSharingWa.value) return;
  isSharingWa.value = true;

  try {
    const targetNumber = formatWhatsAppNumber(bill.value.clientAlternativeMobile || bill.value.clientMobile);

    const companyName = bill.value.companySettings?.companyName || "VAT & Tax Consultancy";
    const clientName = bill.value.clientName || "Valued Client";
    const billNo = bill.value.billNo || "";
    const period = bill.value.taxPeriod || "";
    const invoiceDate = bill.value.billDate ? new Date(bill.value.billDate).toLocaleDateString() : "";
    const dueDate = paymentDueDate.value;
    const grandTotal = Number(bill.value.grandTotal || 0).toFixed(2);
    const netDue = Number(bill.value.dueAmount || 0).toFixed(2);

    const text = `*INVOICE / BILL NOTICE*
━━━━━━━━━━━━━━━━━━━━
Dear *${clientName}*,

Greetings from *${companyName}*.
Your invoice for Tax Period *${period}* has been issued.

📄 *Invoice No:* ${billNo}
🗓️ *Tax Period:* ${period}
📅 *Invoice Date:* ${invoiceDate}
⏰ *Payment Due Date:* ${dueDate}

💰 *Total Payable:* ${grandTotal} Tk
⚠️ *Net Due:* ${netDue} Tk

Thank you for your business!
*${companyName}*`;

    const encodedText = encodeURIComponent(text);
    const waAppUrl = targetNumber
      ? `whatsapp://send?phone=${targetNumber}&text=${encodedText}`
      : `whatsapp://send?text=${encodedText}`;

    // Capture Invoice image
    const captured = await captureInvoiceBlob();
    const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    // 1) Mobile Native Share
    if (isMobileDevice && captured && navigator.share && navigator.canShare) {
      const file = new File([captured.blob], captured.filename, { type: "image/jpeg" });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `Invoice ${billNo}`,
            text: text
          });
          toast.success("Share sheet opened");
          return;
        } catch (err: any) {
          if (err?.name === "AbortError") return;
        }
      }
    }

    // 2) Desktop: Copy image to Clipboard and launch WhatsApp Desktop
    let copiedToClipboard = false;
    if (captured && navigator.clipboard && typeof ClipboardItem !== "undefined") {
      try {
        const pngBlob = await jpgToPng(captured.blob);
        const item = new ClipboardItem({ "image/png": pngBlob });
        await navigator.clipboard.write([item]);
        copiedToClipboard = true;
      } catch (err) {
        console.warn("Clipboard copy not supported or failed:", err);
      }
    }

    // Launch WhatsApp
    window.location.href = waAppUrl;

    if (copiedToClipboard) {
      toast.success("ছবি কপি হয়েছে — WhatsApp চ্যাটে Ctrl+V চাপুন", 3000);
    } else {
      toast.info("WhatsApp অ্যাপ ওপেন হচ্ছে...", 2000);
    }
  } catch (err) {
    console.error("WhatsApp share error:", err);
    toast.error("Failed to prepare WhatsApp share");
  } finally {
    isSharingWa.value = false;
  }
};

const handlePrint = () => {
  const el = document.getElementById("printable-invoice");
  if (!el) {
    window.print();
    return;
  }

  const printContent = el.innerHTML;
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

  doc.open();
  doc.write(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${document.title || 'Invoice'}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 15mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      background-color: #ffffff !important;
      background: #ffffff !important;
      color: #212529 !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
    }
    .firm-name {
      color: #111417;
      letter-spacing: -0.5px;
    }
    .invoice-title {
      color: #495057;
      font-size: 0.95rem;
      letter-spacing: 1px;
    }
    .section-box, .terms-box, .calculation-box {
      background-color: #f8f9fa !important;
      border: 1px solid #dee2e6 !important;
      border-radius: 6px;
    }
    .invoice-table-wrapper {
      border: 1px solid #dee2e6 !important;
      border-radius: 6px;
      overflow: hidden;
      margin-bottom: 1.5rem;
    }
    .invoice-table {
      width: 100%;
      margin-bottom: 0;
    }
    .invoice-table th {
      background-color: #f1f3f5 !important;
      color: #343a40 !important;
      font-weight: 700;
      font-size: 0.85rem;
      text-transform: uppercase;
      border-bottom: 1px solid #dee2e6 !important;
      padding: 10px 12px;
    }
    .invoice-table td {
      padding: 12px 10px;
      border-bottom: 1px solid #e9ecef !important;
      font-size: 0.9rem;
    }
    .invoice-table tbody tr:last-child td {
      border-bottom: none !important;
    }
    .signature-section {
      margin-top: 2.5rem !important;
      padding-top: 1rem !important;
      page-break-inside: avoid;
      break-inside: avoid;
    }
  </style>
</head>
<body>
  <div class="container-fluid p-0">
    ${printContent}
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
  }, 350);
};

const handleCloseTab = () => {
  if (window.opener) {
    window.close();
  } else {
    router.push("/admin/billing");
  }
};
</script>

<template>
  <div class="invoice-page-wrapper">
    <!-- Top Action Toolbar (Hidden during Print) -->
    <div class="invoice-toolbar d-print-none shadow-sm py-2 px-3 mb-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
      <div class="d-flex align-items-center gap-3">
        <router-link to="/admin/billing" class="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1">
          <i class="bi bi-arrow-left"></i>
          <span>Back to Invoices</span>
        </router-link>
      </div>

      <div class="d-flex align-items-center gap-2 flex-wrap">
        <!-- WhatsApp Share Button (Icon Only) -->
        <button
          type="button"
          class="btn btn-success btn-sm px-2.5 py-1 shadow-sm d-flex align-items-center justify-content-center"
          style="background-color: #25D366; border-color: #25D366; color: #ffffff;"
          :disabled="isSharingWa || loading || !bill"
          @click="handleWhatsAppShare"
          :title="bill?.clientAlternativeMobile || bill?.clientMobile ? `Send via WhatsApp (${bill?.clientAlternativeMobile || bill?.clientMobile})` : 'Send via WhatsApp'"
        >
          <span v-if="isSharingWa" class="spinner-border spinner-border-sm"></span>
          <i v-else class="bi bi-whatsapp fs-6"></i>
        </button>

        <!-- Download JPG Button (Icon Only) -->
        <button
          type="button"
          class="btn btn-outline-light btn-sm px-2.5 py-1 shadow-sm d-flex align-items-center justify-content-center"
          :disabled="isGeneratingJpg || loading || !bill"
          @click="handleDownloadJpg"
          title="Download JPG Image"
        >
          <span v-if="isGeneratingJpg" class="spinner-border spinner-border-sm"></span>
          <i v-else class="bi bi-file-earmark-image fs-6"></i>
        </button>

        <!-- Print / PDF Button (Icon Only) -->
        <button
          type="button"
          class="btn btn-primary btn-sm px-2.5 py-1 shadow-sm d-flex align-items-center justify-content-center"
          :disabled="loading || !bill"
          @click="handlePrint"
          title="Print / Save PDF"
        >
          <i class="bi bi-printer-fill fs-6"></i>
        </button>

        <!-- Close Button (Icon Only) -->
        <button
          type="button"
          class="btn btn-secondary btn-sm px-2.5 py-1 shadow-sm d-flex align-items-center justify-content-center"
          @click="handleCloseTab"
          title="Close Tab"
        >
          <i class="bi bi-x-lg fs-6"></i>
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="text-center py-5 text-muted d-print-none">
      <div class="spinner-border text-primary mb-3"></div>
      <div>Loading Invoice Details...</div>
    </div>

    <!-- Error State -->
    <div v-else-if="!bill" class="text-center py-5 text-muted d-print-none">
      <i class="bi bi-exclamation-triangle text-warning fs-1 mb-2"></i>
      <h5 class="text-white">Invoice Not Found</h5>
      <p class="small text-secondary">The requested invoice could not be found or you do not have permission to view it.</p>
    </div>

    <!-- Printable A4 Invoice Sheet -->
    <div v-else class="invoice-sheet" id="printable-invoice">
      <!-- 1. Header: Firm & Document Title -->
      <div class="invoice-header d-flex justify-content-between align-items-start border-bottom pb-3 mb-3">
        <div class="firm-details">
          <h3 class="firm-name fw-bold text-dark mb-1">
            {{ bill.companySettings?.companyName || 'VAT & TAX CONSULTANCY SERVICES' }}
          </h3>
          <div v-if="bill.companySettings?.address" class="firm-text text-secondary small">
            {{ bill.companySettings.address }}
          </div>
          <div class="firm-contact text-secondary small mt-1">
            <div v-if="bill.companySettings?.phone" class="mb-0.5">
              <strong>Phone:</strong> {{ bill.companySettings.phone }}
            </div>
            <div v-if="bill.companySettings?.email" class="mb-0.5">
              <strong>Email:</strong> {{ bill.companySettings.email }}
            </div>
            <div v-if="bill.companySettings?.binNumber">
              <strong>BIN:</strong> {{ bill.companySettings.binNumber }}
            </div>
          </div>
        </div>

        <div class="invoice-badge-box text-end">
          <div class="invoice-title fw-bold text-uppercase">INVOICE / BILL</div>
          <div class="invoice-number font-monospace fw-bold fs-5 text-primary">
            #{{ bill.billNo }}
          </div>
          <div class="status-pill mt-1">
            <span
              class="badge"
              :class="{
                'bg-success': bill.status === 'paid',
                'bg-warning text-dark': bill.status === 'partial' || bill.status === 'draft',
                'bg-danger': bill.status === 'unpaid' || bill.status === 'overdue',
                'bg-secondary': bill.status === 'cancelled'
              }"
            >
              {{ bill.status?.toUpperCase() }}
            </span>
          </div>
        </div>
      </div>

      <!-- 2. Invoice Meta & Bill To Info Grid -->
      <div class="row g-3 mb-4 align-items-stretch">
        <!-- Bill To (Client) -->
        <div class="col-7">
          <div class="section-box p-3 rounded bg-light border h-100">
            <div class="text-uppercase text-muted fw-bold small mb-2" style="letter-spacing: 0.5px;">Billed To:</div>
            <h5 class="fw-bold text-dark mb-1">{{ bill.clientName }}</h5>
            <div v-if="bill.clientProprietor" class="small text-secondary mb-1">
              <strong>Proprietor:</strong> {{ bill.clientProprietor }}
            </div>
            <div v-if="bill.clientBin" class="small mb-1 font-monospace">
              <strong>BIN:</strong> {{ bill.clientBin }}
            </div>
            <div v-if="bill.clientMobile" class="small text-secondary mb-1">
              <strong>Mobile:</strong> {{ bill.clientMobile }}
            </div>
            <div v-if="bill.clientAddress" class="small text-secondary">
              <strong>Address:</strong> {{ bill.clientAddress }}
            </div>
          </div>
        </div>

        <!-- Invoice Details -->
        <div class="col-5">
          <div class="section-box p-3 rounded bg-light border h-100">
            <div class="text-uppercase text-muted fw-bold small mb-2" style="letter-spacing: 0.5px;">Invoice Details:</div>
            <div class="d-flex justify-content-between small py-1 border-bottom border-light-subtle">
              <span class="text-muted">Tax Period:</span>
              <span class="fw-bold font-monospace text-dark">{{ bill.taxPeriod }}</span>
            </div>
            <div class="d-flex justify-content-between small py-1 border-bottom border-light-subtle">
              <span class="text-muted">Invoice Date:</span>
              <span class="fw-bold text-dark">{{ new Date(bill.billDate).toLocaleDateString() }}</span>
            </div>
            <div class="d-flex justify-content-between small py-1 border-bottom border-light-subtle">
              <span class="text-muted">Payment Due Date:</span>
              <span class="fw-bold text-danger">{{ paymentDueDate }}</span>
            </div>
            <div v-if="bill.referenceName" class="d-flex justify-content-between small py-1">
              <span class="text-muted">Reference:</span>
              <span class="text-dark">{{ bill.referenceName }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 3. Line Items Table -->
      <div class="invoice-table-wrapper mb-4 rounded border overflow-hidden">
        <table class="table invoice-table mb-0">
          <thead>
            <tr>
              <th style="width: 6%;">#</th>
              <th style="width: 64%;">Service Item & Description</th>
              <th style="width: 10%; text-align: center;">Qty</th>
              <th style="width: 20%; text-align: right;">Amount (Tk)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(it, idx) in bill.items" :key="it.id || idx">
              <td class="text-muted">{{ Number(idx) + 1 }}</td>
              <td>
                <div class="fw-bold text-dark">{{ it.itemName }}</div>
                <div v-if="it.notes" class="text-muted small">{{ it.notes }}</div>
              </td>
              <td class="text-center font-monospace">{{ it.qty }}</td>
              <td class="text-end font-monospace fw-bold text-dark">{{ Number(it.finalAmount).toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 4. Summary & Totals Calculation Grid -->
      <div class="row g-3 mb-4 align-items-stretch">
        <!-- Terms & Payment Notes -->
        <div class="col-7">
          <div class="terms-box p-3 rounded border bg-light h-100">
            <div class="fw-bold small text-dark mb-1">Terms & Conditions:</div>
            <div class="text-secondary small font-monospace" style="white-space: pre-line; line-height: 1.5;">
              {{ bill.companySettings?.invoiceTerms || '1. Payment is due within 7 days of invoice date.\n2. Please mention invoice number as payment reference.\n3. Thank you for your business!' }}
            </div>
            <div v-if="bill.notes" class="mt-2 pt-2 border-top small text-muted">
              <strong>Remarks:</strong> {{ bill.notes }}
            </div>
          </div>
        </div>

        <!-- Financial Calculation Breakdown -->
        <div class="col-5">
          <div class="calculation-box p-3 rounded border bg-light h-100">
            <div class="d-flex justify-content-between small py-1 border-bottom">
              <span class="text-muted">Current Subtotal:</span>
              <span class="font-monospace fw-bold">{{ Number(bill.subtotal).toFixed(2) }} Tk</span>
            </div>
            <div v-if="bill.discountAmount > 0" class="d-flex justify-content-between small py-1 border-bottom text-success">
              <span>Special Discount:</span>
              <span class="font-monospace">-{{ Number(bill.discountAmount).toFixed(2) }} Tk</span>
            </div>
            <div class="d-flex justify-content-between small py-1 border-bottom">
              <span class="text-muted">
                {{ bill.previousDue > 0 ? 'Previous Due' : bill.previousDue < 0 ? 'Advance Balance' : 'Previous Balance' }}:
              </span>
              <span class="font-monospace fw-semibold" :class="bill.previousDue > 0 ? 'text-danger' : bill.previousDue < 0 ? 'text-success' : 'text-dark'">
                {{ bill.previousDue > 0 ? `+${Number(bill.previousDue).toFixed(2)}` : bill.previousDue < 0 ? `-${Math.abs(Number(bill.previousDue)).toFixed(2)}` : '0.00' }} Tk
              </span>
            </div>
            <div class="d-flex justify-content-between py-2 border-bottom mt-1 bg-white px-2 rounded border">
              <span class="fw-bold text-dark">Total Payable:</span>
              <span class="font-monospace fw-bold fs-6 text-primary">{{ Number(bill.grandTotal).toFixed(2) }} Tk</span>
            </div>
            <div class="d-flex justify-content-between small py-1 border-bottom text-success mt-1">
              <span>Paid Amount:</span>
              <span class="font-monospace fw-bold">{{ Number(bill.paidAmount || 0).toFixed(2) }} Tk</span>
            </div>
            <div class="d-flex justify-content-between py-2 mt-1 bg-dark text-white px-2 rounded">
              <span class="fw-bold">Net Due:</span>
              <span class="font-monospace fw-bold fs-5" :class="Number(bill.dueAmount) > 0 ? 'text-warning' : 'text-light'">
                {{ Number(bill.dueAmount).toFixed(2) }} Tk
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 5. Signatures Footer -->
      <div class="signature-section d-flex justify-content-between align-items-end mt-5 pt-4">
        <div class="text-center" style="width: 200px;">
          <div class="border-top border-dark pt-2 small text-muted">Customer Signature</div>
        </div>
        <div class="text-center" style="width: 220px;">
          <div class="border-top border-dark pt-2 small fw-bold text-dark">
            Authorized Signature & Seal
          </div>
          <div class="small text-muted" style="font-size: 0.75rem;">
            {{ bill.companySettings?.companyName || 'VAT & Tax Consultancy' }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.invoice-page-wrapper {
  min-height: 100vh;
  background-color: #0d1117;
  padding: 1.5rem 1rem 3rem;
  width: 100%;
}

.invoice-toolbar {
  max-width: 860px;
  margin: 0 auto 1.5rem auto;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
}

.invoice-sheet {
  background: #ffffff;
  color: #212529;
  padding: 3rem;
  margin: 0 auto;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
  width: 100%;
  max-width: 860px;
}

.firm-name {
  color: #111417;
  letter-spacing: -0.5px;
}

.invoice-title {
  color: #495057;
  font-size: 0.95rem;
  letter-spacing: 1px;
}

.invoice-table-wrapper {
  border: 1px solid #e9ecef !important;
  border-radius: 6px;
  overflow: hidden;
}

.invoice-table {
  width: 100%;
}

.invoice-table th {
  background-color: #f1f3f5;
  color: #343a40;
  font-weight: 700;
  font-size: 0.85rem;
  text-transform: uppercase;
  border-bottom: 1px solid #dee2e6;
  padding: 10px 12px;
}

.invoice-table td {
  padding: 12px 10px;
  border-bottom: 1px solid #e9ecef;
  font-size: 0.9rem;
}

.invoice-table tbody tr:last-child td {
  border-bottom: none;
}

@page {
  size: A4 portrait;
  margin: 10mm 12mm;
}

/* Dedicated A4 Print Styles */
@media print {
  .invoice-page-wrapper {
    padding: 0 !important;
    margin: 0 !important;
    background: #ffffff !important;
    min-height: auto !important;
  }

  .invoice-sheet {
    position: static !important;
    width: 100% !important;
    max-width: 100% !important;
    padding: 0 !important;
    margin: 0 auto !important;
    box-shadow: none !important;
    border: none !important;
    background: #ffffff !important;
  }

  .d-print-none {
    display: none !important;
  }

  .section-box,
  .terms-box,
  .calculation-box,
  .invoice-table-wrapper,
  .signature-section {
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .signature-section {
    margin-top: 2.5rem !important;
    padding-top: 1rem !important;
  }
}
</style>

<style>
@media print {
  html, body, #app {
    background: #ffffff !important;
    background-color: #ffffff !important;
    color: #000000 !important;
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    height: auto !important;
    min-height: auto !important;
    overflow: visible !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}
</style>
