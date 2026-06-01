export interface InteractiveElement {
  selector: string;
  description: string;
  element_type: string;
}

export interface DiscoveredFlow {
  name: string;
  steps: string[];
  pages_involved: number[];
  complexity: "low" | "medium" | "high";
}

export interface CapturedPage {
  url: string;
  title: string;
  structure_text: string;
  screenshot_storage_id?: string;
  semantic_description?: string;
  interactive_elements?: InteractiveElement[];
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
