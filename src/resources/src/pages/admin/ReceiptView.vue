<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useBillingApi } from "@/composables/useBillingApi";
import { useToast } from "@/composables/useToast";

const route = useRoute();
const router = useRouter();
const toast = useToast();
const { fetchCollectionDetails } = useBillingApi();

const collectionId = Number(route.params.id);
const loading = ref(true);
const collection = ref<any>(null);
const isGeneratingJpg = ref(false);
const isSharingWa = ref(false);

const fromTab = computed(() => (route.query.tab as string) || "collections");
const backQuery = computed(() => {
  const q: any = {};
  if (fromTab.value) q.tab = fromTab.value;
  return q;
});

onMounted(async () => {
  if (!collectionId || isNaN(collectionId)) {
    loading.value = false;
    return;
  }
  try {
    const data = await fetchCollectionDetails(collectionId);
    collection.value = data;
    if (data?.receiptNo) {
      document.title = `Receipt ${data.receiptNo} — ${data.clientName || 'IDP'}`;
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

// Render receipt DOM into high-res JPG Blob
const captureReceiptBlob = async (): Promise<{ blob: Blob; filename: string } | null> => {
  const el = document.getElementById("printable-receipt");
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
    const filename = `${(collection.value?.receiptNo || "receipt").replace(/[/\\]/g, "-")}.jpg`;
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
    const captured = await captureReceiptBlob();
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
    toast.success("Receipt JPG downloaded successfully");
  } catch (err) {
    toast.error("Failed to download JPG");
  } finally {
    isGeneratingJpg.value = false;
  }
};

const handleWhatsAppShare = async () => {
  if (!collection.value || isSharingWa.value) return;
  isSharingWa.value = true;

  try {
    const targetNumber = formatWhatsAppNumber(collection.value.clientMobile);

    const companyName = collection.value.companySettings?.companyName || "VAT & Tax Consultancy";
    const clientName = collection.value.clientName || "Valued Client";
    const receiptNo = collection.value.receiptNo || "";
    const paymentDate = collection.value.collectionDate
      ? new Date(collection.value.collectionDate).toLocaleDateString()
      : "";
    const amount = Number(collection.value.amount || 0).toFixed(2);
    const paymentMethod = (collection.value.paymentMethod || "CASH").toUpperCase();
    const referenceNo = collection.value.referenceNo;
    const billNo = collection.value.billNo;
    const taxPeriod = collection.value.taxPeriod;
    const remainingDue = Number(collection.value.clientOutstandingDue ?? 0).toFixed(2);

    let billInfo = "";
    if (billNo) {
      billInfo = `\n📄 *Against Invoice:* #${billNo}${taxPeriod ? ` (Period: ${taxPeriod})` : ""}`;
    }

    let refInfo = "";
    if (referenceNo) {
      refInfo = `\n🔢 *Ref/Txn:* ${referenceNo}`;
    }

    let dueInfo = "";
    if (Number(collection.value.clientOutstandingDue) > 0) {
      dueInfo = `\n⚠️ *Current Due:* ${remainingDue} Tk`;
    } else {
      dueInfo = `\n✅ *Status:* Paid / No Due`;
    }

    const text = `*MONEY RECEIPT / PAYMENT CONFIRMATION*
━━━━━━━━━━━━━━━━━━━━
Dear *${clientName}*,

We have received your payment with thanks.

🧾 *Receipt No:* ${receiptNo}
📅 *Payment Date:* ${paymentDate}
💳 *Payment Mode:* ${paymentMethod}${refInfo}${billInfo}

💰 *Amount Received:* ${amount} Tk${dueInfo}

Thank you for your business!
*${companyName}*`;

    const encodedText = encodeURIComponent(text);
    const waAppUrl = targetNumber
      ? `whatsapp://send?phone=${targetNumber}&text=${encodedText}`
      : `whatsapp://send?text=${encodedText}`;

    // Capture receipt image
    const captured = await captureReceiptBlob();
    const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    // 1) Mobile Native Share
    if (isMobileDevice && captured && navigator.share && navigator.canShare) {
      const file = new File([captured.blob], captured.filename, { type: "image/jpeg" });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `Receipt ${receiptNo}`,
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
  const el = document.getElementById("printable-receipt");
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
  <title>${document.title || 'Money Receipt'}</title>
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
    .receipt-title {
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
      white-space: nowrap !important;
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
    router.push({ path: "/admin/billing", query: backQuery.value });
  }
};
</script>

<template>
  <div class="receipt-page-wrapper">
    <!-- Top Action Toolbar (Hidden during Print) -->
    <div class="receipt-toolbar d-print-none shadow-sm py-2 px-3 mb-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
      <div class="d-flex align-items-center gap-3">
        <router-link :to="{ path: '/admin/billing', query: backQuery }" class="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1">
          <i class="bi bi-arrow-left"></i>
          <span>Back to Collections</span>
        </router-link>
      </div>

      <div class="d-flex align-items-center gap-2 flex-wrap">
        <!-- WhatsApp Share Button (Icon Only) -->
        <button
          type="button"
          class="btn btn-success btn-sm px-2.5 py-1 shadow-sm d-flex align-items-center justify-content-center"
          style="background-color: #25D366; border-color: #25D366; color: #ffffff;"
          :disabled="isSharingWa || loading || !collection"
          @click="handleWhatsAppShare"
          :title="collection?.clientMobile ? `Send via WhatsApp (${collection.clientMobile})` : 'Send via WhatsApp'"
        >
          <span v-if="isSharingWa" class="spinner-border spinner-border-sm"></span>
          <i v-else class="bi bi-whatsapp fs-6"></i>
        </button>

        <!-- Download JPG Button (Icon Only) -->
        <button
          type="button"
          class="btn btn-outline-light btn-sm px-2.5 py-1 shadow-sm d-flex align-items-center justify-content-center"
          :disabled="isGeneratingJpg || loading || !collection"
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
          :disabled="loading || !collection"
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
      <div>Loading Receipt Details...</div>
    </div>

    <!-- Error State -->
    <div v-else-if="!collection" class="text-center py-5 text-muted d-print-none">
      <i class="bi bi-exclamation-triangle text-warning fs-1 mb-2"></i>
      <h5 class="text-white">Receipt Not Found</h5>
      <p class="small text-secondary">The requested money receipt could not be found or you do not have permission to view it.</p>
    </div>

    <!-- Printable A4 Receipt Sheet (Exact Match with Invoice Sheet) -->
    <div v-else class="receipt-sheet" id="printable-receipt">
      <!-- 1. Header: Firm & Document Title -->
      <div class="receipt-header d-flex justify-content-between align-items-start border-bottom pb-3 mb-3">
        <div class="firm-details">
          <h3 class="firm-name fw-bold text-dark mb-1">
            {{ collection.companySettings?.companyName || 'VAT & TAX CONSULTANCY SERVICES' }}
          </h3>
          <div v-if="collection.companySettings?.address" class="firm-text text-secondary small">
            {{ collection.companySettings.address }}
          </div>
          <div class="firm-contact text-secondary small mt-1">
            <div v-if="collection.companySettings?.phone" class="mb-0.5">
              <strong>Phone:</strong> {{ collection.companySettings.phone }}
            </div>
            <div v-if="collection.companySettings?.email" class="mb-0.5">
              <strong>Email:</strong> {{ collection.companySettings.email }}
            </div>
            <div v-if="collection.companySettings?.binNumber">
              <strong>BIN:</strong> {{ collection.companySettings.binNumber }}
            </div>
          </div>
        </div>

        <div class="receipt-badge-box text-end">
          <div class="receipt-title fw-bold text-uppercase">MONEY RECEIPT</div>
          <div class="receipt-number font-monospace fw-bold fs-5 text-success">
            #{{ collection.receiptNo }}
          </div>
          <div class="status-pill mt-1">
            <span
              class="badge"
              :class="{
                'bg-success': collection.status === 'completed',
                'bg-secondary': collection.status === 'cancelled'
              }"
            >
              {{ collection.status === 'completed' ? 'RECEIVED' : collection.status?.toUpperCase() }}
            </span>
          </div>
        </div>
      </div>

      <!-- 2. Meta & Received From Info Grid -->
      <div class="row g-3 mb-4 align-items-stretch">
        <!-- Received From (Client) -->
        <div class="col-7">
          <div class="section-box p-3 rounded bg-light border h-100">
            <div class="text-uppercase text-muted fw-bold small mb-2" style="letter-spacing: 0.5px;">Received With Thanks From:</div>
            <h5 class="fw-bold text-dark mb-1">{{ collection.clientName }}</h5>
            <div v-if="collection.clientProprietor" class="small text-secondary mb-1">
              <strong>Proprietor:</strong> {{ collection.clientProprietor }}
            </div>
            <div v-if="collection.clientBin" class="small mb-1 font-monospace">
              <strong>BIN:</strong> {{ collection.clientBin }}
            </div>
            <div v-if="collection.clientMobile" class="small text-secondary mb-1">
              <strong>Mobile:</strong> {{ collection.clientMobile }}
            </div>
            <div v-if="collection.clientAddress" class="small text-secondary">
              <strong>Address:</strong> {{ collection.clientAddress }}
            </div>
          </div>
        </div>

        <!-- Receipt Details Box -->
        <div class="col-5">
          <div class="section-box p-3 rounded bg-light border h-100">
            <div class="text-uppercase text-muted fw-bold small mb-2" style="letter-spacing: 0.5px;">Receipt Details:</div>
            <div class="d-flex justify-content-between small py-1 border-bottom border-light-subtle">
              <span class="text-muted">Payment Date:</span>
              <span class="fw-bold text-dark">{{ new Date(collection.collectionDate).toLocaleDateString() }}</span>
            </div>
            <div v-if="collection.referenceNo" class="d-flex justify-content-between small py-1 border-bottom border-light-subtle">
              <span class="text-muted">Ref / Cheque No:</span>
              <span class="font-monospace fw-bold text-dark">{{ collection.referenceNo }}</span>
            </div>
            <div class="d-flex justify-content-between small py-1">
              <span class="text-muted">Received By:</span>
              <span class="fw-semibold text-dark">{{ collection.receivedByName || 'Authorized Staff' }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 3. Particulars Table -->
      <div class="invoice-table-wrapper mb-4 rounded border overflow-hidden">
        <table class="table invoice-table mb-0">
          <thead>
            <tr>
              <th style="width: 5%;" class="text-nowrap">#</th>
              <th style="width: 50%;">Description / Particulars</th>
              <th style="width: 25%; text-align: center;" class="text-nowrap">Payment Mode</th>
              <th style="width: 20%; text-align: right;" class="text-nowrap">Amount (Tk)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="text-muted">1</td>
              <td>
                <div class="fw-bold text-dark">
                  {{ collection.billNo ? `Payment received against Invoice #${collection.billNo}` : 'VAT Consultancy & Professional Service Fee' }}
                </div>
                <div v-if="collection.taxPeriod" class="text-muted small">
                  Tax Period: {{ collection.taxPeriod }}
                </div>
                <div v-if="collection.notes" class="text-muted small mt-0.5">
                  Remarks: {{ collection.notes }}
                </div>
              </td>
              <td class="text-center">
                <span class="badge bg-secondary text-uppercase font-monospace">{{ collection.paymentMethod }}</span>
              </td>
              <td class="text-end font-monospace fw-bold text-dark">{{ Number(collection.amount).toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 4. Summary & Balance Calculation Grid -->
      <div class="row g-3 mb-4 align-items-stretch">
        <!-- Notes & Acknowledgement -->
        <div class="col-7">
          <div class="terms-box p-3 rounded border bg-light h-100">
            <div class="fw-bold small text-dark mb-1">Acknowledgement:</div>
            <div class="text-secondary small font-monospace" style="white-space: pre-line; line-height: 1.5;">
              Received with thanks the sum of Tk {{ Number(collection.amount).toFixed(2) }} from {{ collection.clientName }}.
              Thank you for your business!
            </div>
            <div v-if="collection.referenceNo" class="mt-2 pt-2 border-top small text-muted">
              <strong>Transaction / Cheque Reference:</strong> {{ collection.referenceNo }}
            </div>
          </div>
        </div>

        <!-- Financial Breakdown -->
        <div class="col-5">
          <div class="calculation-box p-3 rounded border bg-light h-100">
            <div class="d-flex justify-content-between py-2 border-bottom bg-white px-2 rounded border">
              <span class="fw-bold text-dark">Total Received:</span>
              <span class="font-monospace fw-bold fs-6 text-success">{{ Number(collection.amount).toFixed(2) }} Tk</span>
            </div>
            <div class="d-flex justify-content-between py-2 mt-2 bg-dark text-white px-2 rounded">
              <span class="fw-bold">Outstanding Due:</span>
              <span class="font-monospace fw-bold fs-5" :class="Number(collection.clientOutstandingDue) > 0 ? 'text-warning' : 'text-light'">
                {{ Number(collection.clientOutstandingDue || 0).toFixed(2) }} Tk
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 5. Signatures Footer -->
      <div class="signature-section d-flex justify-content-between align-items-end mt-5 pt-4">
        <div class="text-center" style="width: 200px;">
          <div class="border-top border-dark pt-2 small text-muted">
            {{ collection.receivedByName || 'Prepared / Received By' }}
          </div>
        </div>
        <div class="text-center" style="width: 220px;">
          <div class="border-top border-dark pt-2 small fw-bold text-dark">
            Authorized Signature & Seal
          </div>
          <div class="small text-muted" style="font-size: 0.75rem;">
            {{ collection.companySettings?.companyName || 'VAT & Tax Consultancy' }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.receipt-page-wrapper {
  min-height: 100vh;
  background-color: #0d1117;
  padding: 1.5rem 1rem 3rem;
  width: 100%;
}

.receipt-toolbar {
  max-width: 860px;
  margin: 0 auto 1.5rem auto;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
}

.receipt-sheet {
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

.receipt-title {
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
  white-space: nowrap !important;
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
  .receipt-page-wrapper {
    padding: 0 !important;
    margin: 0 !important;
    background: #ffffff !important;
    min-height: auto !important;
  }

  .receipt-sheet {
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
