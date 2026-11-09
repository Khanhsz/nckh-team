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
      papers: {
        Row: {
          created_at: string; created_by: string; error: string | null; evidence: Json; fields: Json; file_name: string; id: string;
          model: string | null; project_id: string; status: string; storage_path: string | null; updated_at: string; updated_by: string | null; warnings: Json;
          drive_file_id: string | null; drive_modified_time: string | null; drive_web_link: string | null; file_size: number | null; extracted_at: string | null; verified: Json;
        };
        Insert: {
          created_at?: string; created_by?: string; error?: string | null; evidence?: Json; fields?: Json; file_name: string; id?: string;
          model?: string | null; project_id: string; status?: string; storage_path?: string | null; updated_at?: string; updated_by?: string | null; warnings?: Json;
          drive_file_id?: string | null; drive_modified_time?: string | null; drive_web_link?: string | null; file_size?: number | null; extracted_at?: string | null; verified?: Json;
        };
        Update: {
          created_at?: string; created_by?: string; error?: string | null; evidence?: Json; fields?: Json; file_name?: string; id?: string;
          model?: string | null; project_id?: string; status?: string; storage_path?: string | null; updated_at?: string; updated_by?: string | null; warnings?: Json;
          drive_file_id?: string | null; drive_modified_time?: string | null; drive_web_link?: string | null; file_size?: number | null; extracted_at?: string | null; verified?: Json;
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
          code: string | null; created_at: string; end_date: string; id: string; name: string; owner_id: string; research_model: string;
          research_topic: string; start_date: string; synthesis: string; synthesis_updated_at: string | null; updated_at: string;
          drive_folder_id: string | null; drive_folder_name: string | null; drive_synced_at: string | null;
          writing_folder_id: string | null; writing_folder_name: string | null;
        };
        Insert: {
          code?: string | null; created_at?: string; end_date?: string; id?: string; name: string; owner_id: string; research_model?: string;
          research_topic?: string; start_date?: string; synthesis?: string; synthesis_updated_at?: string | null; updated_at?: string;
          drive_folder_id?: string | null; drive_folder_name?: string | null; drive_synced_at?: string | null;
          writing_folder_id?: string | null; writing_folder_name?: string | null;
        };
        Update: {
          code?: string | null; created_at?: string; end_date?: string; id?: string; name?: string; owner_id?: string; research_model?: string;
          research_topic?: string; start_date?: string; synthesis?: string; synthesis_updated_at?: string | null; updated_at?: string;
          drive_folder_id?: string | null; drive_folder_name?: string | null; drive_synced_at?: string | null;
          writing_folder_id?: string | null; writing_folder_name?: string | null;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          assignee_id: string | null; created_at: string; created_by: string; depends_on: string[]; description: string | null; due_date: string;
          id: string; milestone_id: string | null; parent_id: string | null; is_team: boolean; progress: number; project_id: string; start_date: string; status: string; title: string;
          updated_at: string; updated_by: string | null; category: string;
        };
        Insert: {
          assignee_id?: string | null; created_at?: string; created_by?: string; depends_on?: string[]; description?: string | null; due_date: string;
          id?: string; milestone_id?: string | null; parent_id?: string | null; is_team?: boolean; progress?: number; project_id: string; start_date: string; status?: string; title: string;
          updated_at?: string; updated_by?: string | null; category?: string;
        };
        Update: {
          assignee_id?: string | null; created_at?: string; created_by?: string; depends_on?: string[]; description?: string | null; due_date?: string;
          id?: string; milestone_id?: string | null; parent_id?: string | null; is_team?: boolean; progress?: number; project_id?: string; start_date?: string; status?: string; title?: string;
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
