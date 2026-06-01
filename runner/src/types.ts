export interface CapturedPage {
  url: string;
  title: string;
  structure_text: string;
  screenshot_storage_id?: string;
}

export interface ExplorationWorkItem {
  exploration_id: string;
  url: string;
  workspace_id: string;
  auth_mode: "none" | "form" | "cookie";
  login_url?: string;
  username?: string;
  password?: string;
  cookie_name?: string;
  cookie_value?: string;
  additional_urls?: string[];
  interactive: boolean;
}
