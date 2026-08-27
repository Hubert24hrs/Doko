import { describe, expect, it } from "vitest";

import { buildTree } from "@/features/geo/queries";
import type { GeoEntityRow, GeoKind } from "@/types/database";

function row(
  id: string,
  kind: GeoKind,
  name: string,
  parentId: string | null,
): GeoEntityRow {
  return {
    id,
    parent_id: parentId,
    kind,
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    aliases: [],
    description: null,
    latitude: null,
    longitude: null,
    cover_image_path: null,
    sort_order: 0,
    status: "active",
    merged_into_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
  };
}

describe("buildTree", () => {
  it("returns an empty array for no rows", () => {
    expect(buildTree([])).toEqual([]);
  });

  it("nests the Igbo-Eze North hierarchy correctly", () => {
    const rows = [
      row("lga", "lga", "Igbo-Eze North", null),
      row("town", "town", "Enugu-Ezike", "lga"),
      row("district", "district", "Umuozzi", "town"),
      row("village", "village", "Ogrute", "district"),
    ];

    const tree = buildTree(rows);

    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe("Igbo-Eze North");
    expect(tree[0].children[0].name).toBe("Enugu-Ezike");
    expect(tree[0].children[0].children[0].name).toBe("Umuozzi");
    expect(tree[0].children[0].children[0].children[0].name).toBe("Ogrute");
  });

  it("keeps siblings under a shared parent", () => {
    const rows = [
      row("town", "town", "Enugu-Ezike", null),
      row("d1", "district", "Umuozzi", "town"),
      row("d2", "district", "Essodo", "town"),
      row("d3", "district", "Umuitodo", "town"),
    ];

    const tree = buildTree(rows);
    expect(tree).toHaveLength(1);
    expect(tree[0].children.map((c) => c.name)).toEqual([
      "Umuozzi",
      "Essodo",
      "Umuitodo",
    ]);
  });

  it("promotes orphans instead of dropping them", () => {
    // A village whose district was archived must still be reachable, or it
    // would silently vanish from the directory.
    const rows = [
      row("lga", "lga", "Igbo-Eze North", null),
      row("orphan", "village", "Ogrute", "missing-district"),
    ];

    const tree = buildTree(rows);
    expect(tree).toHaveLength(2);
    expect(tree.map((n) => n.name).sort()).toEqual(["Igbo-Eze North", "Ogrute"]);
  });

  it("handles multiple roots", () => {
    const rows = [
      row("a", "town", "Enugu-Ezike", null),
      row("b", "town", "Ette", null),
    ];
    expect(buildTree(rows)).toHaveLength(2);
  });

  it("does not mutate the input rows", () => {
    const rows = [row("lga", "lga", "Igbo-Eze North", null)];
    const snapshot = JSON.parse(JSON.stringify(rows));
    buildTree(rows);
    expect(rows).toEqual(snapshot);
  });

  it("copies every column onto the node", () => {
    const rows = [row("lga", "lga", "Igbo-Eze North", null)];
    const [node] = buildTree(rows);
    expect(node.slug).toBe("igbo-eze-north");
    expect(node.status).toBe("active");
    expect(node.children).toEqual([]);
  });
});
