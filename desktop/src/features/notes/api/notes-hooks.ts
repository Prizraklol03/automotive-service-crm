import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createNoteRequest,
  deleteNoteRequest,
  getNoteRequest,
  listNotesRequest,
  updateNoteRequest
} from "@/entities/note/api/note-api";
import type { NotePayload } from "@/entities/note/model/types";

export function notesListQueryKey(search: string) {
  return ["notes", "list", search.trim()] as const;
}

export function noteDetailQueryKey(noteId: number) {
  return ["notes", "detail", noteId] as const;
}

export function useNotesQuery(search: string) {
  const normalizedSearch = search.trim();
  return useQuery({
    queryKey: notesListQueryKey(normalizedSearch),
    queryFn: () => listNotesRequest(normalizedSearch)
  });
}

export function useNoteDetailQuery(noteId: number | null) {
  return useQuery({
    queryKey: noteId ? noteDetailQueryKey(noteId) : ["notes", "detail", "empty"],
    queryFn: () => getNoteRequest(noteId as number),
    enabled: noteId !== null
  });
}

export function useCreateNoteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: NotePayload) => createNoteRequest(payload),
    onSuccess: (note) => {
      queryClient.setQueryData(noteDetailQueryKey(note.id), note);
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
    }
  });
}

export function useUpdateNoteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ noteId, payload }: { noteId: number; payload: NotePayload }) => updateNoteRequest(noteId, payload),
    onSuccess: (note) => {
      queryClient.setQueryData(noteDetailQueryKey(note.id), note);
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
    }
  });
}

export function useDeleteNoteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (noteId: number) => deleteNoteRequest(noteId),
    onSuccess: (_, noteId) => {
      queryClient.removeQueries({ queryKey: noteDetailQueryKey(noteId) });
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
    }
  });
}
