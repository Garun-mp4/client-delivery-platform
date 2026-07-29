export interface ProjectExportRecord {
  readonly project: {
    readonly name: string;
    readonly companyName: string;
    readonly description: string | null;
    readonly status: string;
    readonly plannedStartDate: string;
    readonly plannedEndDate: string;
    readonly exportedAt: string;
  };
  readonly scope: readonly {
    readonly revision: number;
    readonly status: string;
    readonly summary: string;
    readonly createdAt: string;
  }[];
  readonly stages: readonly {
    readonly name: string;
    readonly status: string;
    readonly plannedEndDate: string;
    readonly resultSummary: string | null;
    readonly skipReason: string | null;
  }[];
  readonly updates: readonly {
    readonly title: string;
    readonly body: string;
    readonly publishedAt: string;
  }[];
  readonly versions: readonly {
    readonly versionNumber: number;
    readonly name: string;
    readonly changeLog: string;
    readonly url: string;
    readonly publishedAt: string | null;
  }[];
  readonly feedback: readonly {
    readonly title: string;
    readonly body: string;
    readonly status: string;
    readonly createdAt: string;
    readonly comments: readonly {
      readonly body: string;
      readonly deleted: boolean;
      readonly createdAt: string;
    }[];
  }[];
  readonly approvals: readonly {
    readonly entityType: string;
    readonly title: string;
    readonly status: string;
    readonly requestedAt: string;
    readonly resolvedAt: string | null;
  }[];
  readonly checklist: readonly {
    readonly label: string;
    readonly completedAt: string | null;
  }[];
}

export interface ProjectExportAttachment {
  readonly storageKey: string;
  readonly normalizedName: string;
  readonly detectedMimeType: string;
  readonly size: number;
  readonly checksum: string;
}

export interface ProjectExportRendered {
  readonly markdown: string;
  readonly html: string;
}
