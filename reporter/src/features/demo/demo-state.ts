export type DemoStage = "signup" | "application" | "payment" | "kyc" | "approval" | "app";
export type DemoStoryStatus = "Draft" | "Under review" | "Published";

export type DemoStory = {
  id: string;
  title: string;
  summary: string;
  body: string;
  beat: string;
  language: string;
  location: string;
  status: DemoStoryStatus;
};

export type DemoState = { stage: DemoStage; stories: DemoStory[] };

const stages: DemoStage[] = ["signup", "application", "payment", "kyc", "approval", "app"];

export function initialDemoState(): DemoState {
  return {
    stage: "signup",
    stories: [
      { id: "sample-review", title: "Monsoon flooding disrupts Kothrud traffic", summary: "Traffic diversions followed heavy rain.", body: "A synthetic sample report.", beat: "Civic affairs", language: "English", location: "Kothrud, Pune", status: "Under review" },
      { id: "sample-published", title: "Women-led market opens near Deccan", summary: "Local entrepreneurs opened a weekend market.", body: "A synthetic sample report.", beat: "Community", language: "English", location: "Deccan, Pune", status: "Published" },
    ],
  };
}

export function advanceOnboarding(state: DemoState): DemoState {
  const next = stages[Math.min(stages.indexOf(state.stage) + 1, stages.length - 1)];
  return { ...state, stage: next };
}

export function addStory(state: DemoState, story: Omit<DemoStory, "id" | "status">): DemoState {
  return { ...state, stories: [{ ...story, id: `story-${state.stories.length + 1}`, status: "Draft" }, ...state.stories] };
}

export function submitStory(state: DemoState, id: string): DemoState {
  return { ...state, stories: state.stories.map((story) => story.id === id && story.status === "Draft" ? { ...story, status: "Under review" } : story) };
}
