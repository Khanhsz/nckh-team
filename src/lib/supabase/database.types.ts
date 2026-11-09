// Sinh tự động từ Supabase (generate_typescript_types) — rút gọn phần helper.
// Chạy lại khi đổi schema: npx supabase gen types typescript --project-id ffmlfnphmqddmjjekjgu

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.18' };
  public: {
    Tables: {
      ai_usage: {
        Row: { action: string; usage_date: string; used: number; user_id: string };
        Insert: { action: string; usage_date: string; used?: number; user_id: string };
        Update: { action?: string; usage_date?: string; used?: number; user_id?: string };
        Relationships: [];
      };
      milestones: {
        Row: { created_at: string; due_date: string; id: string; name: string; project_id: string; sort_order: number };
        Insert: { created_at?: string; due_date: string; id?: string; name: string; project_id: string; sort_order?: number };
        Update: { created_at?: string; due_date?: string; id?: string; name?: string; project_id?: string; sort_order?: number };
        Relationships: [
          { foreignKeyName: 'milestones_project_id_fkey'; columns: ['project_id']; isOneToOne: false; referencedRelation: 'projects'; referencedColumns: ['id'] }
        ];
      };
      ownership_transfers: {
        Row: { id: string; project_id: string; from_user: string; to_user: string; status: string; message: string | null; created_at: string; expires_at: string; responded_at: string | null };
        Insert: { id?: string; project_id: string; from_user: string; to_user: string; status?: string; message?: string | null };
        Update: { status?: string; responded_at?: string | null };
        Relationships: [];
      };
      paper_refs: {
        Row: { paper_id: string; project_id: string; refs: Json; ref_count: number; fetched_at: string };
        Insert: { paper_id: string; project_id: string; refs?: Json; ref_count?: number; fetched_at?: string };
        Update: { refs?: Json; ref_count?: number; fetched_at?: string };
        Relationships: [];
      };
      project_ref_meta: {
        Row: { project_id: string; doi: string; title: string | null; authors: string | null; year: number | null; container: string | null; issns: string[]; cited_by: number | null; fetched_at: string };
        Insert: { project_id: string; doi: string; title?: string | null; authors?: string | null; year?: number | null; container?: string | null; issns?: string[]; cited_by?: number | null; fetched_at?: string };
        Update: { title?: string | null; authors?: string | null; year?: number | null; container?: string | null; issns?: string[]; cited_by?: number | null; fetched_at?: string };
        Relationships: [];
      };
      project_ref_dismissed: {
        Row: { project_id: string; ref_key: string; dismissed_by: string; created_at: string };
        Insert: { project_id: string; ref_key: string; dismissed_by?: string; created_at?: string };
        Update: { ref_key?: string };
        Relationships: [];
      };
      project_constructs: {
        Row: { project_id: string; raw_key: string; canonical: string; updated_at: string };
        Insert: { project_id: string; raw_key: string; canonical: string; updated_at?: string };
        Update: { canonical?: string; updated_at?: string };
        Relationships: [];
      };
      user_notify: {
        Row: { user_id: string; calendar_token: string | null; digest_email: boolean; last_digest_on: string | null; updated_at: string };
        Insert: { user_id: string; calendar_token?: string | null; digest_email?: boolean; updated_at?: string };
        Update: { calendar_token?: string | null; digest_email?: boolean; updated_at?: string };
        Relationships: [];
      };
      project_watchlist: {
        Row: { id: string; project_id: string; kind: string; name: string; name_norm: string | null; note: string | null; created_by: string; created_at: string };
        Insert: { id?: string; project_id: string; kind: string; name: string; note?: string | null; created_by?: string; created_at?: string };
        Update: { id?: string; project_id?: string; kind?: string; name?: string; note?: string | null; created_by?: string; created_at?: string };
        Relationships: [];
      };
      journal_ranks: {
        Row: { sourceid: number; title: string; title_norm: string | null; issns: string[]; sjr: number | null; quartile: string | null; h_index: number | null; categories: string | null; publisher: string | null; rank_year: number | null; updated_at: string };
        Insert: { sourceid: number; title: string; issns?: string[]; sjr?: number | null; quartile?: string | null; h_index?: number | null; categories?: string | null; publisher?: string | null; rank_year?: number | null; updated_at?: string };
        Update: { sourceid?: number; title?: string; issns?: string[]; sjr?: number | null; quartile?: string | null; h_index?: number | null; categories?: string | null; publisher?: string | null; rank_year?: number | null; updated_at?: string };
        Relationships: [];
      };
      journal_flags: {
        Row: { id: number; kind: string; title: string | null; title_norm: string | null; issns: string[]; publisher: string | null; publisher_norm: string | null; reason: string | null; since: string | null; updated_at: string };
        Insert: { id?: number; kind: string; title?: string | null; issns?: string[]; publisher?: string | null; reason?: string | null; since?: string | null; updated_at?: string };
        Update: { id?: number; kind?: string; title?: string | null; issns?: string[]; publisher?: string | null; reason?: string | null; since?: string | null; updated_at?: string };
        Relationships: [];
      };
      papers: {
        Row: {
          created_at: string; created_by: string; error: string | null; evidence: Json; fields: Json; file_name: string; id: string;
          model: string | null; project_id: string; status: string; storage_path: string | null; updated_at: string; updated_by: string | null; warnings: Json;
          drive_file_id: string | null; drive_modified_time: string | null; drive_web_link: string | null; file_size: number | null; extracted_at: string | null; verified: Json;
          doi: string | null; journal: string | null; issns: string[]; publisher: string | null; pub_year: number | null; cited_by: number | null; meta_source: string | null; meta_checked_at: string | null; journal_norm: string | null; publisher_norm: string | null; csl: Json | null; relations: Json | null; relations_at: string | null;
        };
        Insert: {
          created_at?: string; created_by?: string; error?: string | null; evidence?: Json; fields?: Json; file_name: string; id?: string;
          model?: string | null; project_id: string; status?: string; storage_path?: string | null; updated_at?: string; updated_by?: string | null; warnings?: Json;
          drive_file_id?: string | null; drive_modified_time?: string | null; drive_web_link?: string | null; file_size?: number | null; extracted_at?: string | null; verified?: Json;
          doi?: string | null; journal?: string | null; issns?: string[]; publisher?: string | null; pub_year?: number | null; cited_by?: number | null; meta_source?: string | null; meta_checked_at?: string | null; csl?: Json | null; relations?: Json | null; relations_at?: string | null;
        };
        Update: {
          created_at?: string; created_by?: string; error?: string | null; evidence?: Json; fields?: Json; file_name?: string; id?: string;
          model?: string | null; project_id?: string; status?: string; storage_path?: string | null; updated_at?: string; updated_by?: string | null; warnings?: Json;
          drive_file_id?: string | null; drive_modified_time?: string | null; drive_web_link?: string | null; file_size?: number | null; extracted_at?: string | null; verified?: Json;
          doi?: string | null; journal?: string | null; issns?: string[]; publisher?: string | null; pub_year?: number | null; cited_by?: number | null; meta_source?: string | null; meta_checked_at?: string | null; csl?: Json | null; relations?: Json | null; relations_at?: string | null;
        };
        Relationships: [
          { foreignKeyName: 'papers_project_id_fkey'; columns: ['project_id']; isOneToOne: false; referencedRelation: 'projects'; referencedColumns: ['id'] }
        ];
      };
      profiles: {
        Row: {
          created_at: string; display_name: string; email: string | null; id: string; onboarded: boolean; phone: string | null;
          research_interest: string | null; student_id: string | null; updated_at: string;
        };
        Insert: {
          created_at?: string; display_name?: string; email?: string | null; id: string; onboarded?: boolean; phone?: string | null;
          research_interest?: string | null; student_id?: string | null; updated_at?: string;
        };
        Update: {
          created_at?: string; display_name?: string; email?: string | null; id?: string; onboarded?: boolean; phone?: string | null;
          research_interest?: string | null; student_id?: string | null; updated_at?: string;
        };
        Relationships: [];
      };
      project_invites: {
        Row: {
          created_at: string; created_by: string; expires_at: string; id: string; project_id: string; redeemed_at: string | null;
          redeemed_by: string | null; role: string; token_hash: string;
        };
        Insert: {
          created_at?: string; created_by: string; expires_at?: string; id?: string; project_id: string; redeemed_at?: string | null;
          redeemed_by?: string | null; role: string; token_hash: string;
        };
        Update: {
          created_at?: string; created_by?: string; expires_at?: string; id?: string; project_id?: string; redeemed_at?: string | null;
          redeemed_by?: string | null; role?: string; token_hash?: string;
        };
        Relationships: [
          { foreignKeyName: 'project_invites_project_id_fkey'; columns: ['project_id']; isOneToOne: false; referencedRelation: 'projects'; referencedColumns: ['id'] }
        ];
      };
      project_members: {
        Row: { joined_at: string; project_id: string; role: string; user_id: string };
        Insert: { joined_at?: string; project_id: string; role: string; user_id: string };
        Update: { joined_at?: string; project_id?: string; role?: string; user_id?: string };
        Relationships: [
          { foreignKeyName: 'project_members_project_id_fkey'; columns: ['project_id']; isOneToOne: false; referencedRelation: 'projects'; referencedColumns: ['id'] }
        ];
      };
      project_documents: {
        Row: { id: string; project_id: string; drive_file_id: string | null; url: string | null; title: string; kind: string; created_by: string; created_at: string };
        Insert: { id?: string; project_id: string; drive_file_id?: string | null; url?: string | null; title: string; kind?: string; created_by?: string; created_at?: string };
        Update: { id?: string; project_id?: string; drive_file_id?: string | null; url?: string | null; title?: string; kind?: string; created_by?: string; created_at?: string };
        Relationships: [
          { foreignKeyName: 'project_documents_project_id_fkey'; columns: ['project_id']; isOneToOne: false; referencedRelation: 'projects'; referencedColumns: ['id'] }
        ];
      };
      projects: {
        Row: {
          code: string | null; cover: string | null; cover_y: number; created_at: string; end_date: string; id: string; name: string; owner_id: string; research_model: string;
          research_topic: string; start_date: string; synthesis: string; synthesis_updated_at: string | null; updated_at: string;
          drive_folder_id: string | null; drive_folder_name: string | null; drive_synced_at: string | null;
          writing_folder_id: string | null; writing_folder_name: string | null;
        };
        Insert: {
          code?: string | null; cover?: string | null; cover_y?: number; created_at?: string; end_date?: string; id?: string; name: string; owner_id: string; research_model?: string;
          research_topic?: string; start_date?: string; synthesis?: string; synthesis_updated_at?: string | null; updated_at?: string;
          drive_folder_id?: string | null; drive_folder_name?: string | null; drive_synced_at?: string | null;
          writing_folder_id?: string | null; writing_folder_name?: string | null;
        };
        Update: {
          code?: string | null; cover?: string | null; cover_y?: number; created_at?: string; end_date?: string; id?: string; name?: string; owner_id?: string; research_model?: string;
          research_topic?: string; start_date?: string; synthesis?: string; synthesis_updated_at?: string | null; updated_at?: string;
          drive_folder_id?: string | null; drive_folder_name?: string | null; drive_synced_at?: string | null;
          writing_folder_id?: string | null; writing_folder_name?: string | null;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          assignee_id: string | null; created_at: string; created_by: string; depends_on: string[]; description: string | null; due_date: string;
          id: string; milestone_id: string | null; parent_id: string | null; is_team: boolean; co_assignee_ids: string[]; progress: number; project_id: string; start_date: string; status: string; title: string;
          updated_at: string; updated_by: string | null; category: string;
        };
        Insert: {
          assignee_id?: string | null; created_at?: string; created_by?: string; depends_on?: string[]; description?: string | null; due_date: string;
          id?: string; milestone_id?: string | null; parent_id?: string | null; is_team?: boolean; co_assignee_ids?: string[]; progress?: number; project_id: string; start_date: string; status?: string; title: string;
          updated_at?: string; updated_by?: string | null; category?: string;
        };
        Update: {
          assignee_id?: string | null; created_at?: string; created_by?: string; depends_on?: string[]; description?: string | null; due_date?: string;
          id?: string; milestone_id?: string | null; parent_id?: string | null; is_team?: boolean; co_assignee_ids?: string[]; progress?: number; project_id?: string; start_date?: string; status?: string; title?: string;
          updated_at?: string; updated_by?: string | null; category?: string;
        };
        Relationships: [
          { foreignKeyName: 'tasks_milestone_id_fkey'; columns: ['milestone_id']; isOneToOne: false; referencedRelation: 'milestones'; referencedColumns: ['id'] },
          { foreignKeyName: 'tasks_project_id_fkey'; columns: ['project_id']; isOneToOne: false; referencedRelation: 'projects'; referencedColumns: ['id'] }
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      accept_project_invite: { Args: { p_token: string }; Returns: string };
      cron_drive_projects: { Args: { p_secret: string }; Returns: { project_id: string; folder_id: string }[] };
      cron_apply_drive_listing: { Args: { p_secret: string; p_project_id: string; p_files: Json }; Returns: Json };
      mark_drive_synced: { Args: { p_project_id: string }; Returns: undefined };
      paper_credibility: {
        Args: { p_project: string };
        Returns: { paper_id: string; quartile: string | null; sjr: number | null; h_index: number | null; categories: string | null; rank_year: number | null; rank_title: string | null; flags: Json }[];
      };
      cron_papers_needing_meta: {
        Args: { p_secret: string; p_limit?: number };
        Returns: { id: string; file_name: string; info: string | null; doi: string | null; journal: string | null; issns: string[] }[];
      };
      cron_set_paper_meta: { Args: { p_secret: string; p_id: string; p_meta: Json }; Returns: undefined };
      is_any_project_owner: { Args: Record<string, never>; Returns: boolean };
      rotate_calendar_token: { Args: Record<string, never>; Returns: string };
      request_ownership_transfer: { Args: { p_project_id: string; p_to_user: string; p_message?: string | null }; Returns: string };
      respond_ownership_transfer: { Args: { p_id: string; p_accept: boolean }; Returns: string };
      cancel_ownership_transfer: { Args: { p_id: string }; Returns: undefined };
      my_ownership_invites: {
        Args: Record<string, never>;
        Returns: { id: string; project_id: string; project_name: string; project_code: string | null; from_name: string; message: string | null; created_at: string; expires_at: string }[];
      };
      calendar_feed: {
        Args: { p_token: string };
        Returns: {
          kind: string; id: string; title: string; start_date: string; due_date: string; status: string | null; progress: number | null;
          project_code: string | null; project_name: string; is_team: boolean; owner_view: boolean;
        }[];
      };
      cron_digest: { Args: { p_secret: string; p_today: string }; Returns: { user_id: string; email: string | null; display_name: string | null; items: Json }[] };
      consume_ai_quota: { Args: { p_action: string; p_project_id: string }; Returns: boolean };
      create_project_invite: { Args: { p_project_id: string; p_role?: string }; Returns: string };
      project_can_edit: { Args: { p_project_id: string }; Returns: boolean };
      project_role: { Args: { p_project_id: string }; Returns: string };
      remove_project_member: { Args: { p_project_id: string; p_user_id: string }; Returns: undefined };
      save_project_synthesis: { Args: { p_project_id: string; p_text: string }; Returns: undefined };
      set_project_member_role: { Args: { p_project_id: string; p_role: string; p_user_id: string }; Returns: undefined };
      share_project_with: { Args: { p_user_id: string }; Returns: boolean };
      storage_project_id: { Args: { p_path: string }; Returns: string };
      update_paper_field: { Args: { p_field: string; p_paper_id: string; p_value: string }; Returns: undefined };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
