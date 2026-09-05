import { apiRequest } from "@/shared/api/client";
import type {
  Document,
  DocumentPreview,
  DocumentPrintPayload,
  DocumentType,
  DocumentWorkDatesPayload
} from "@/entities/document/model/types";

export function listOrderDocumentsRequest(orderId: number) {
  return apiRequest<Document[]>(`/orders/${orderId}/documents`);
}

export function createOrderDocumentRequest(orderId: number, documentType: DocumentType) {
  return apiRequest<Document>(`/orders/${orderId}/documents/${documentType}`, {
    method: "POST"
  });
}

export function ensureOrderDocumentRequest(orderId: number, documentType: DocumentType) {
  return apiRequest<Document>(`/orders/${orderId}/documents/${documentType}/ensure`, {
    method: "POST"
  });
}

export function downloadOrderDocumentDocxRequestPath(orderId: number, documentType: DocumentType) {
  return `/orders/${orderId}/documents/${documentType}/download/docx`;
}

export function downloadOrderDocumentPdfRequestPath(orderId: number, documentType: DocumentType) {
  return `/orders/${orderId}/documents/${documentType}/download/pdf`;
}

export function getDocumentRequest(documentId: number) {
  return apiRequest<Document>(`/documents/${documentId}`);
}

export function updateDocumentWorkDatesRequest(documentId: number, payload: DocumentWorkDatesPayload) {
  return apiRequest<Document>(`/documents/${documentId}/work-dates`, {
    method: "PUT",
    body: payload
  });
}

export function renderDocumentRequest(documentId: number) {
  return apiRequest<Document>(`/documents/${documentId}/render`, {
    method: "POST"
  });
}

export function generateDocumentPdfRequest(documentId: number) {
  return apiRequest<Document>(`/documents/${documentId}/generate-pdf`, {
    method: "POST"
  });
}

export function previewDocumentRequest(documentId: number) {
  return apiRequest<DocumentPreview>(`/documents/${documentId}/preview`);
}

export function printDocumentRequest(documentId: number) {
  return apiRequest<DocumentPrintPayload>(`/documents/${documentId}/print`, {
    method: "POST"
  });
}
