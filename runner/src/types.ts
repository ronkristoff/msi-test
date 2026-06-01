export interface InteractiveElement {
  selector: string;
  description: string;
  element_type: string;
}

export interface DiscoveredFlow {
  name: string;
  description?: string;
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

export interface TestStep {
  instruction: string;
  assertion_code?: string;
  expected_outcome?: string;
  learned_selector?: string;
  learned_description?: string;
}

export interface RunTestItem {
  _id: string;
  name: string;
  playwright_code: string;
  execution_type: string | null;
  steps: TestStep[] | null;
}

export interface RunWorkItem {
  run_id: string;
  workspace_id: string;
  project_id: string;
  environment_id: string | null;
  base_url: string | null;
  trigger_type: string;
  tests: RunTestItem[];
  run_result_ids: Array<{ _id: string; test_id: string }>;
  auth_mode?: string;
  login_url?: string;
  test_username?: string;
  test_password?: string;
  test_data?: Record<string, string>;
  heal_confidence_threshold?: number;
}
