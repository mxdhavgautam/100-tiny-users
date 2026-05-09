import { z } from "zod";

export type WorkbenchCaseStatus = "new" | "in_review" | "waiting_customer" | "ready_to_ship" | "resolved";
export type WorkbenchPriority = "critical" | "high" | "medium";
export type WorkbenchCaseKind = "shipping" | "billing" | "access";
export type WorkbenchActivityType = "system" | "customer" | "note" | "status" | "resolution";
export type WorkbenchResolutionKind = "expedite_shipment" | "issue_credit" | "request_confirmation" | "close_case";

export type WorkbenchChecklistItem = {
  id: string;
  label: string;
  done: boolean;
};

export type WorkbenchActivity = {
  id: string;
  at: string;
  actor: string;
  type: WorkbenchActivityType;
  title: string;
  detail: string;
};

export type WorkbenchCase = {
  id: string;
  kind: WorkbenchCaseKind;
  title: string;
  summary: string;
  status: WorkbenchCaseStatus;
  priority: WorkbenchPriority;
  channel: "chat" | "email" | "phone";
  customerName: string;
  company: string;
  owner: string | null;
  openedAt: string;
  dueAt: string;
  lastUpdatedAt: string;
  orderNumber: string;
  region: string;
  requestedOutcome: string;
  lastCustomerMessage: string;
  tags: string[];
  suggestedActions: string[];
  checklist: WorkbenchChecklistItem[];
  availableResolutions: WorkbenchResolutionKind[];
  activity: WorkbenchActivity[];
};

export type WorkbenchSnapshot = {
  generatedAt: string;
  stats: {
    openCount: number;
    urgentCount: number;
    waitingCount: number;
    resolvedToday: number;
  };
  cases: WorkbenchCase[];
  owners: string[];
};

export type WorkbenchCaseMutationInput = {
  owner: string | null;
  status: WorkbenchCaseStatus;
};

export type WorkbenchNoteInput = {
  body: string;
};

export type WorkbenchResolutionInput = {
  kind: WorkbenchResolutionKind;
  customerMessage: string;
  shippingWindow?: "same_day" | "next_morning";
  creditAmount?: number;
  requestedField?: "serial_number" | "shipping_address" | "invoice_contact" | "admin_email_on_sso_provider";
};

type WorkbenchStore = {
  cases: WorkbenchCase[];
  generatedAt: string;
};

const owners = ["Unassigned", "Avery Kim", "Jordan Lee", "Sam Patel", "Priya Shah"] as const;

const caseMutationSchema = z.object({
  owner: z.union([z.string().trim().min(1).max(80), z.literal("Unassigned")]),
  status: z.enum(["new", "in_review", "waiting_customer", "ready_to_ship", "resolved"])
});

const noteSchema = z.object({
  body: z.string().trim().min(8).max(600)
});

const resolutionSchema = z
  .object({
    kind: z.enum(["expedite_shipment", "issue_credit", "request_confirmation", "close_case"]),
    customerMessage: z.string().trim().min(12).max(600),
    shippingWindow: z.enum(["same_day", "next_morning"]).optional(),
    creditAmount: z.number().min(25).max(500).optional(),
    requestedField: z.enum(["serial_number", "shipping_address", "invoice_contact", "admin_email_on_sso_provider"]).optional()
  })
  .superRefine((value, ctx) => {
    if (value.kind === "expedite_shipment" && !value.shippingWindow) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose a shipping window for expedition.",
        path: ["shippingWindow"]
      });
    }

    if (value.kind === "issue_credit" && value.creditAmount === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a credit amount.",
        path: ["creditAmount"]
      });
    }

    if (value.kind === "request_confirmation" && !value.requestedField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose which customer detail needs confirmation.",
        path: ["requestedField"]
      });
    }
  });

function isoAt(hoursAgo: number): string {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
}

function makeSeedCases(): WorkbenchCase[] {
  return [
    {
      id: "wb-2408",
      kind: "shipping",
      title: "Onboarding laptop replacement has not left the warehouse",
      summary: "A VIP new hire starts tomorrow morning. The replacement device is still in manual review and the customer success team needs a same-day recovery plan.",
      status: "new",
      priority: "critical",
      channel: "chat",
      customerName: "Nadia Brooks",
      company: "Northline Design",
      owner: null,
      openedAt: isoAt(5),
      dueAt: isoAt(-11),
      lastUpdatedAt: isoAt(1),
      orderNumber: "SO-4421",
      region: "US West",
      requestedOutcome: "Confirm a fast replacement path before 9 AM local time tomorrow.",
      lastCustomerMessage: "We promised the employee a configured machine on day one. If it slips, they lose onboarding access and we look incompetent.",
      tags: ["vip", "day-one onboarding", "shipping risk"],
      suggestedActions: [
        "Assign an owner and call the warehouse queue.",
        "Offer a same-day courier if stock is ready.",
        "Send the customer a concrete ETA, not a generic apology."
      ],
      checklist: [
        { id: "wb-2408-check-1", label: "Confirm stock is physically available", done: true },
        { id: "wb-2408-check-2", label: "Escalate manual review with fraud ops", done: false },
        { id: "wb-2408-check-3", label: "Send recovery plan to customer success", done: false }
      ],
      availableResolutions: ["expedite_shipment", "request_confirmation", "close_case"],
      activity: [
        {
          id: "wb-2408-activity-1",
          at: isoAt(5),
          actor: "System",
          type: "system",
          title: "Case created from onboarding escalation",
          detail: "The customer success workspace opened a shipping exception after the order stayed in manual review for 2 hours."
        },
        {
          id: "wb-2408-activity-2",
          at: isoAt(2),
          actor: "Maya from Customer Success",
          type: "customer",
          title: "Customer success follow-up",
          detail: "Need a guaranteed path today. The start date cannot move."
        }
      ]
    },
    {
      id: "wb-2411",
      kind: "billing",
      title: "Annual plan charged twice after seat expansion",
      summary: "Finance reported that a mid-cycle seat expansion created a second invoice instead of a prorated delta. The customer expects a credit memo before month end.",
      status: "in_review",
      priority: "high",
      channel: "email",
      customerName: "Luis Ortega",
      company: "Juniper Health",
      owner: "Avery Kim",
      openedAt: isoAt(12),
      dueAt: isoAt(-24),
      lastUpdatedAt: isoAt(3),
      orderNumber: "INV-9012",
      region: "US Central",
      requestedOutcome: "Reverse the duplicate charge and confirm the corrected renewal total.",
      lastCustomerMessage: "Our controller needs a clean paper trail. Please don't just say the refund is pending.",
      tags: ["billing", "finance", "renewal risk"],
      suggestedActions: [
        "Audit the invoice pair and confirm the duplicate line item.",
        "Issue a documented service credit with the corrected renewal total.",
        "Reply with the credit memo timing so finance can close the books."
      ],
      checklist: [
        { id: "wb-2411-check-1", label: "Verify the duplicate invoice line item", done: true },
        { id: "wb-2411-check-2", label: "Draft corrected renewal total", done: true },
        { id: "wb-2411-check-3", label: "Send finance-facing resolution note", done: false }
      ],
      availableResolutions: ["issue_credit", "request_confirmation", "close_case"],
      activity: [
        {
          id: "wb-2411-activity-1",
          at: isoAt(12),
          actor: "System",
          type: "system",
          title: "Billing anomaly detected",
          detail: "Invoice INV-9011 and INV-9012 share the same seat expansion event."
        },
        {
          id: "wb-2411-activity-2",
          at: isoAt(6),
          actor: "Avery Kim",
          type: "note",
          title: "Internal note added",
          detail: "Confirmed the customer should only owe the prorated delta. Drafting credit now."
        }
      ]
    },
    {
      id: "wb-2414",
      kind: "access",
      title: "Workspace admin locked out after SSO domain migration",
      summary: "The primary admin can sign in, but every admin-only page bounces back to the chooser. They are trying to finish a production cutover this afternoon.",
      status: "waiting_customer",
      priority: "high",
      channel: "phone",
      customerName: "Harper Owens",
      company: "Brightlayer Energy",
      owner: "Sam Patel",
      openedAt: isoAt(20),
      dueAt: isoAt(-4),
      lastUpdatedAt: isoAt(4),
      orderNumber: "AUTH-118",
      region: "EU",
      requestedOutcome: "Verify the post-migration admin identity and restore access without bypassing SSO.",
      lastCustomerMessage: "I can log in, but settings boot me right back out. We changed our email domain yesterday.",
      tags: ["auth", "sso migration", "admin access"],
      suggestedActions: [
        "Collect the exact admin email now attached to the IdP.",
        "Confirm which workspace member record should retain owner access.",
        "Avoid manual bypasses that would break the SSO policy."
      ],
      checklist: [
        { id: "wb-2414-check-1", label: "Verify IdP domain migration timestamp", done: true },
        { id: "wb-2414-check-2", label: "Request the new admin email value", done: false },
        { id: "wb-2414-check-3", label: "Map the old and new member identities", done: false }
      ],
      availableResolutions: ["request_confirmation", "close_case"],
      activity: [
        {
          id: "wb-2414-activity-1",
          at: isoAt(20),
          actor: "System",
          type: "system",
          title: "Case opened from phone transcription",
          detail: "Customer reported admin lockout immediately after an SSO domain migration."
        },
        {
          id: "wb-2414-activity-2",
          at: isoAt(8),
          actor: "Sam Patel",
          type: "status",
          title: "Status changed to waiting on customer",
          detail: "Requested confirmation of the new admin email value present in the IdP."
        }
      ]
    },
    {
      id: "wb-2417",
      kind: "shipping",
      title: "Replacement kit delivered incomplete for field technician",
      summary: "The customer received the shell and docs, but the calibration card is missing. The technician is on-site tomorrow and needs either a partial ship or alternate path.",
      status: "ready_to_ship",
      priority: "medium",
      channel: "email",
      customerName: "Zoe Bennett",
      company: "Harbor Grid",
      owner: "Priya Shah",
      openedAt: isoAt(30),
      dueAt: isoAt(-18),
      lastUpdatedAt: isoAt(2),
      orderNumber: "SO-4457",
      region: "US East",
      requestedOutcome: "Confirm the replacement component ETA and keep the field deployment on schedule.",
      lastCustomerMessage: "We only need the calibration card. If you can split-ship that piece, tomorrow stays intact.",
      tags: ["field deployment", "partial shipment"],
      suggestedActions: [
        "Confirm whether the calibration card can be split-shipped alone.",
        "Share an ETA the technician can plan around.",
        "Close only after the customer acknowledges the updated shipment path."
      ],
      checklist: [
        { id: "wb-2417-check-1", label: "Verify missing component inventory", done: true },
        { id: "wb-2417-check-2", label: "Prepare split shipment", done: true },
        { id: "wb-2417-check-3", label: "Notify customer with ETA", done: false }
      ],
      availableResolutions: ["expedite_shipment", "close_case"],
      activity: [
        {
          id: "wb-2417-activity-1",
          at: isoAt(30),
          actor: "System",
          type: "system",
          title: "Replacement workflow opened",
          detail: "Warehouse logged a missing calibration card after package closeout."
        },
        {
          id: "wb-2417-activity-2",
          at: isoAt(2),
          actor: "Priya Shah",
          type: "resolution",
          title: "Split shipment prepared",
          detail: "Warehouse confirmed the replacement component can go out separately if the customer accepts the updated ETA."
        }
      ]
    }
  ];
}

function cloneActivity(entry: WorkbenchActivity): WorkbenchActivity {
  return { ...entry };
}

function cloneCase(item: WorkbenchCase): WorkbenchCase {
  return {
    ...item,
    tags: [...item.tags],
    suggestedActions: [...item.suggestedActions],
    checklist: item.checklist.map((check) => ({ ...check })),
    availableResolutions: [...item.availableResolutions],
    activity: item.activity.map(cloneActivity)
  };
}

function cloneStore(store: WorkbenchStore): WorkbenchStore {
  return {
    generatedAt: store.generatedAt,
    cases: store.cases.map(cloneCase)
  };
}

function makeSeedStore(): WorkbenchStore {
  return {
    generatedAt: new Date().toISOString(),
    cases: makeSeedCases()
  };
}

type GlobalWithWorkbench = typeof globalThis & {
  __HTU_WORKBENCH_STORE__?: WorkbenchStore;
};

function getStore(): WorkbenchStore {
  const scopedGlobal = globalThis as GlobalWithWorkbench;
  if (!scopedGlobal.__HTU_WORKBENCH_STORE__) {
    scopedGlobal.__HTU_WORKBENCH_STORE__ = makeSeedStore();
  }
  return scopedGlobal.__HTU_WORKBENCH_STORE__;
}

function saveStore(next: WorkbenchStore): void {
  const scopedGlobal = globalThis as GlobalWithWorkbench;
  scopedGlobal.__HTU_WORKBENCH_STORE__ = next;
}

function makeSnapshot(store: WorkbenchStore): WorkbenchSnapshot {
  const openCases = store.cases.filter((item) => item.status !== "resolved");
  const urgentCases = openCases.filter((item) => item.priority === "critical" || item.priority === "high");
  const waitingCases = store.cases.filter((item) => item.status === "waiting_customer");
  const resolvedToday = store.cases.filter((item) => item.status === "resolved").length;

  return {
    generatedAt: store.generatedAt,
    stats: {
      openCount: openCases.length,
      urgentCount: urgentCases.length,
      waitingCount: waitingCases.length,
      resolvedToday
    },
    owners: [...owners],
    cases: store.cases
      .slice()
      .sort((left, right) => {
        const priorityRank: Record<WorkbenchPriority, number> = { critical: 0, high: 1, medium: 2 };
        const priorityDelta = priorityRank[left.priority] - priorityRank[right.priority];
        if (priorityDelta !== 0) {
          return priorityDelta;
        }
        return right.lastUpdatedAt.localeCompare(left.lastUpdatedAt);
      })
      .map(cloneCase)
  };
}

function nextTimestamp(): string {
  return new Date().toISOString();
}

function appendActivity(item: WorkbenchCase, entry: Omit<WorkbenchActivity, "id" | "at">): WorkbenchCase {
  const activityEntry: WorkbenchActivity = {
    ...entry,
    id: `${item.id}-activity-${item.activity.length + 1}`,
    at: nextTimestamp()
  };

  return {
    ...item,
    lastUpdatedAt: activityEntry.at,
    activity: [activityEntry, ...item.activity]
  };
}

function withStoreMutation<T>(mutator: (draft: WorkbenchStore) => T): T {
  const draft = cloneStore(getStore());
  const result = mutator(draft);
  draft.generatedAt = nextTimestamp();
  saveStore(draft);
  return result;
}

function findCaseIndex(cases: WorkbenchCase[], caseId: string): number {
  return cases.findIndex((item) => item.id === caseId);
}

function assertCaseSupportsResolution(item: WorkbenchCase, kind: WorkbenchResolutionKind): void {
  if (!item.availableResolutions.includes(kind)) {
    throw new Error("That resolution path is not available for this case.");
  }
}

export async function readWorkbenchSnapshot(): Promise<WorkbenchSnapshot> {
  return makeSnapshot(getStore());
}

export async function resetWorkbenchStore(): Promise<WorkbenchSnapshot> {
  saveStore(makeSeedStore());
  return makeSnapshot(getStore());
}

export async function updateWorkbenchCase(caseId: string, input: unknown): Promise<WorkbenchSnapshot> {
  const parsed = caseMutationSchema.parse(input);

  return withStoreMutation((draft) => {
    const index = findCaseIndex(draft.cases, caseId);
    if (index < 0) {
      throw new Error("Case not found.");
    }

    const current = draft.cases[index];
    const owner = parsed.owner === "Unassigned" ? null : parsed.owner;
    let nextCase = { ...current, owner, status: parsed.status };

    if (current.owner !== owner) {
      nextCase = appendActivity(nextCase, {
        actor: "Ops user",
        type: "status",
        title: owner ? `Owner assigned to ${owner}` : "Owner cleared",
        detail: owner ? `${owner} now owns the case.` : "The case was returned to the unassigned queue."
      });
    }

    if (current.status !== parsed.status) {
      nextCase = appendActivity(nextCase, {
        actor: "Ops user",
        type: "status",
        title: `Status changed to ${parsed.status.replaceAll("_", " ")}`,
        detail: `Queue state moved from ${current.status.replaceAll("_", " ")} to ${parsed.status.replaceAll("_", " ")}.`
      });
    }

    draft.cases[index] = nextCase;
    return makeSnapshot(draft);
  });
}

export async function addWorkbenchNote(caseId: string, input: unknown): Promise<WorkbenchSnapshot> {
  const parsed = noteSchema.parse(input);

  return withStoreMutation((draft) => {
    const index = findCaseIndex(draft.cases, caseId);
    if (index < 0) {
      throw new Error("Case not found.");
    }

    const nextCase = appendActivity(draft.cases[index], {
      actor: "Ops user",
      type: "note",
      title: "Internal note added",
      detail: parsed.body
    });

    draft.cases[index] = nextCase;
    return makeSnapshot(draft);
  });
}

export async function resolveWorkbenchCase(caseId: string, input: unknown): Promise<WorkbenchSnapshot> {
  const parsed = resolutionSchema.parse(input);

  return withStoreMutation((draft) => {
    const index = findCaseIndex(draft.cases, caseId);
    if (index < 0) {
      throw new Error("Case not found.");
    }

    const current = draft.cases[index];
    assertCaseSupportsResolution(current, parsed.kind);

    let nextCase = current;
    let title = "Resolution applied";
    let detail = parsed.customerMessage;
    let nextStatus: WorkbenchCaseStatus = current.status;

    if (parsed.kind === "expedite_shipment") {
      title = parsed.shippingWindow === "same_day" ? "Same-day courier approved" : "Next-morning shipment approved";
      detail = `${parsed.customerMessage} Shipping window: ${parsed.shippingWindow === "same_day" ? "same day" : "next morning"}.`;
      nextStatus = "ready_to_ship";
    } else if (parsed.kind === "issue_credit") {
      title = `Service credit queued for $${parsed.creditAmount?.toFixed(0) ?? "0"}`;
      detail = `${parsed.customerMessage} Credit amount: $${parsed.creditAmount?.toFixed(0) ?? "0"}. Finance follow-up is still required before the case can close.`;
      nextStatus = "in_review";
    } else if (parsed.kind === "request_confirmation") {
      const fieldLabelMap: Record<NonNullable<WorkbenchResolutionInput["requestedField"]>, string> = {
        serial_number: "device serial number",
        shipping_address: "shipping address",
        invoice_contact: "invoice contact",
        admin_email_on_sso_provider: "admin email on SSO provider"
      };
      title = "Customer confirmation requested";
      detail = `${parsed.customerMessage} Requested detail: ${fieldLabelMap[parsed.requestedField ?? "serial_number"]}.`;
      nextStatus = "waiting_customer";
    } else if (parsed.kind === "close_case") {
      title = "Case closed";
      detail = parsed.customerMessage;
      nextStatus = "resolved";
    }

    nextCase = appendActivity(
      {
        ...current,
        status: nextStatus
      },
      {
        actor: "Ops user",
        type: "resolution",
        title,
        detail
      }
    );

    draft.cases[index] = nextCase;
    return makeSnapshot(draft);
  });
}
