export type Note = {
  comment: string;
  created_at: string;
  created_by_user_id: number;
  created_by_user_name: string;
  id: number;
  number: number;
  telephone: string | null;
};

export type NotePayload = {
  comment: string;
  telephone: string | null;
};
