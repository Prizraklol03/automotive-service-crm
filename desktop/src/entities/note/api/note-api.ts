import { apiRequest } from "@/shared/api/client";
import type { Note, NotePayload } from "@/entities/note/model/types";

export function listNotesRequest(search: string) {
  const normalizedSearch = search.trim();
  const query = normalizedSearch ? `?q=${encodeURIComponent(normalizedSearch)}` : "";
  return apiRequest<Note[]>(`/notes${query}`);
}

export function getNoteRequest(noteId: number) {
  return apiRequest<Note>(`/notes/${noteId}`);
}

export function createNoteRequest(payload: NotePayload) {
  return apiRequest<Note>("/notes", {
    method: "POST",
    body: payload
  });
}

export function updateNoteRequest(noteId: number, payload: NotePayload) {
  return apiRequest<Note>(`/notes/${noteId}`, {
    method: "PUT",
    body: payload
  });
}

export function deleteNoteRequest(noteId: number) {
  return apiRequest<void>(`/notes/${noteId}`, {
    method: "DELETE"
  });
}
