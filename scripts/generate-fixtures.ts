// Fixture generator (§9), invoked by `npm run seed`. PDFs are programmatic
// shop drawings (pdf-lib): border, dimensioned front+side views with
// extension/dimension lines and arrowheads, notes block, bottom-right title
// block. The STEP fixture is a hand-authored AP214 manifold-solid-brep box.
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

const FIXTURES_DIR = path.join(process.cwd(), "fixtures");

// ---------------------------------------------------------------- PDF drawings

interface DrawingSpec {
  file: string;
  title: string;
  dwgNo: string;
  material: string;
  units: "INCHES" | "MM";
  qty: string; // "" = no quantity on the drawing
  dims: { L: number; W: number; T: number }; // source units, L ≥ W ≥ T
  labels: { L: string; W: string; T: string };
  extraNotes?: string[];
}

const DRAWINGS: DrawingSpec[] = [
  {
    file: "A-bracket-7075.pdf",
    title: "MOUNTING BRACKET",
    dwgNo: "FC-1001",
    material: "AL 7075-T651",
    units: "INCHES",
    qty: "4",
    dims: { L: 7.5, W: 3.2, T: 1.1 },
    labels: { L: "7.50", W: "3.20", T: "1.10" },
  },
  {
    file: "B-plate-metric.pdf",
    title: "SPACER PLATE",
    dwgNo: "FC-1002",
    material: "AL 6061",
    units: "MM",
    qty: "",
    dims: { L: 190, W: 85, T: 22 },
    labels: { L: "190", W: "85", T: "22" },
  },
  {
    file: "C-manifold-316ss.pdf",
    title: "MANIFOLD BODY",
    dwgNo: "FC-1003",
    material: "316 STAINLESS STEEL",
    units: "INCHES",
    qty: "2",
    dims: { L: 6.0, W: 4.0, T: 1.5 },
    labels: { L: "6.00", W: "4.00", T: "1.50" },
  },
  {
    file: "D-rail-oversize.pdf",
    title: "GUIDE RAIL",
    dwgNo: "FC-1004",
    material: "AL 6061-T6",
    units: "INCHES",
    qty: "1",
    dims: { L: 150.0, W: 20.0, T: 1.0 },
    labels: { L: "150.0", W: "20.0", T: "1.00" },
  },
];

const BLACK = rgb(0, 0, 0);
const PAGE_W = 792; // letter landscape
const PAGE_H = 612;

interface Ctx {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
}

function line(c: Ctx, x1: number, y1: number, x2: number, y2: number, w = 0.8) {
  c.page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: w, color: BLACK });
}

function text(c: Ctx, s: string, x: number, y: number, size = 10, bold = false) {
  c.page.drawText(s, { x, y, size, font: bold ? c.bold : c.font, color: BLACK });
}

/** Arrowhead: two barbs at the tip pointing along (dx,dy). */
function arrow(c: Ctx, x: number, y: number, dx: number, dy: number) {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const a = 6; // barb length
  const s = 2.2; // barb spread
  line(c, x, y, x - ux * a - uy * s, y - uy * a + ux * s, 0.8);
  line(c, x, y, x - ux * a + uy * s, y - uy * a - ux * s, 0.8);
}

/** Horizontal dimension below an edge: extension lines down from (x1,yEdge) and (x2,yEdge). */
function dimH(c: Ctx, x1: number, x2: number, yEdge: number, label: string) {
  const yDim = yEdge - 26;
  line(c, x1, yEdge - 4, x1, yDim - 6, 0.5);
  line(c, x2, yEdge - 4, x2, yDim - 6, 0.5);
  line(c, x1, yDim, x2, yDim, 0.8);
  arrow(c, x1, yDim, -1, 0);
  arrow(c, x2, yDim, 1, 0);
  const tw = c.font.widthOfTextAtSize(label, 11);
  // white backing so the label is never struck through by the dim line
  c.page.drawRectangle({
    x: (x1 + x2) / 2 - tw / 2 - 2,
    y: yDim - 5,
    width: tw + 4,
    height: 13,
    color: rgb(1, 1, 1),
  });
  text(c, label, (x1 + x2) / 2 - tw / 2, yDim - 3, 11);
}

/** Vertical dimension to the left of an edge. */
function dimV(c: Ctx, xEdge: number, y1: number, y2: number, label: string) {
  const xDim = xEdge - 26;
  line(c, xEdge - 4, y1, xDim - 6, y1, 0.5);
  line(c, xEdge - 4, y2, xDim - 6, y2, 0.5);
  line(c, xDim, y1, xDim, y2, 0.8);
  arrow(c, xDim, y1, 0, -1);
  arrow(c, xDim, y2, 0, 1);
  const tw = c.font.widthOfTextAtSize(label, 11);
  c.page.drawRectangle({
    x: xDim - tw / 2 - 2,
    y: (y1 + y2) / 2 - 6,
    width: tw + 4,
    height: 13,
    color: rgb(1, 1, 1),
  });
  text(c, label, xDim - tw / 2, (y1 + y2) / 2 - 3, 11);
}

async function generateDrawing(spec: DrawingSpec): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const c: Ctx = { page, font, bold };

  // Sheet border (double)
  page.drawRectangle({ x: 16, y: 16, width: PAGE_W - 32, height: PAGE_H - 32, borderColor: BLACK, borderWidth: 1.4 });
  page.drawRectangle({ x: 22, y: 22, width: PAGE_W - 44, height: PAGE_H - 44, borderColor: BLACK, borderWidth: 0.6 });

  // ---- Views: front (L × W) and right-side (T × W), shared scale.
  const { L, W, T } = spec.dims;
  const scale = Math.min(300 / L, 220 / W);
  const fw = L * scale;
  const fh = W * scale;
  const sw = Math.max(T * scale, 2);

  const fx = 90;
  const fy = 300;
  // front view
  page.drawRectangle({ x: fx, y: fy, width: fw, height: fh, borderColor: BLACK, borderWidth: 1.2 });
  text(c, "FRONT VIEW", fx + fw / 2 - bold.widthOfTextAtSize("FRONT VIEW", 9) / 2, fy + fh + 34, 9, true);
  dimH(c, fx, fx + fw, fy, spec.labels.L);
  dimV(c, fx, fy, fy + fh, spec.labels.W);

  // side view (thickness)
  const sx = fx + fw + 70;
  page.drawRectangle({ x: sx, y: fy, width: sw, height: fh, borderColor: BLACK, borderWidth: 1.2 });
  text(c, "SIDE VIEW", sx + sw / 2 - bold.widthOfTextAtSize("SIDE VIEW", 9) / 2, fy + fh + 34, 9, true);
  dimH(c, sx, sx + sw, fy, spec.labels.T);

  // ---- Notes block (top-left)
  const unitsWord = spec.units === "MM" ? "MILLIMETERS" : "INCHES";
  const notes = [
    "NOTES:",
    `1. UNLESS OTHERWISE SPECIFIED DIMENSIONS ARE IN ${unitsWord}.`,
    "2. BREAK ALL SHARP EDGES .015 MAX.",
    "3. DIMENSIONS APPLY TO FINISHED PART.",
    ...(spec.extraNotes ?? []),
  ];
  notes.forEach((n, i) => text(c, n, 36, PAGE_H - 48 - i * 14, 9, i === 0));

  // ---- Title block (bottom-right)
  const tbX = 480;
  const tbY = 30;
  const tbW = PAGE_W - 30 - tbX;
  const rows: [string, string][] = [
    ["TITLE", spec.title],
    ["DWG NO", spec.dwgNo],
    ["MATERIAL", spec.material],
    ["UNITS", spec.units],
    ["QTY", spec.qty],
    ["REV", "A"],
  ];
  const rowH = 19;
  page.drawRectangle({ x: tbX, y: tbY, width: tbW, height: rowH * rows.length, borderColor: BLACK, borderWidth: 1.2 });
  rows.forEach(([k, v], i) => {
    const y = tbY + rowH * (rows.length - 1 - i);
    if (i > 0) line(c, tbX, y + rowH, tbX + tbW, y + rowH, 0.6);
    line(c, tbX + 78, y, tbX + 78, y + rowH, 0.6);
    text(c, k, tbX + 6, y + 5.5, 8, true);
    text(c, v, tbX + 86, y + 5, 10);
  });

  return doc.save();
}

// ---------------------------------------------------------------- STEP fixture

/**
 * Hand-authored AP214 STEP for a rectangular box [0,dx]×[0,dy]×[0,dz] in mm:
 * full manifold-solid-brep topology (8 vertices, 12 shared edges, 6 planar
 * faces with outward normals) plus the product scaffolding OCCT needs to
 * transfer roots.
 */
export function generateBoxStep(dx: number, dy: number, dz: number): string {
  const ents: string[] = [];
  let n = 0;
  const add = (def: string): number => {
    n++;
    ents.push(`#${n}=${def};`);
    return n;
  };
  const r = (x: number) => (Number.isInteger(x) ? `${x}.` : `${x}`);
  const pt = (x: number, y: number, z: number) =>
    add(`CARTESIAN_POINT('',(${r(x)},${r(y)},${r(z)}))`);
  const dir = (x: number, y: number, z: number) =>
    add(`DIRECTION('',(${r(x)},${r(y)},${r(z)}))`);

  // product / context scaffolding
  const appCtx = add(`APPLICATION_CONTEXT('automotive design')`);
  add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2010,#${appCtx})`);
  const prodCtx = add(`PRODUCT_CONTEXT('',#${appCtx},'mechanical')`);
  const product = add(`PRODUCT('S-block','S-block','',(#${prodCtx}))`);
  const formation = add(`PRODUCT_DEFINITION_FORMATION('','',#${product})`);
  const defCtx = add(`PRODUCT_DEFINITION_CONTEXT('part definition',#${appCtx},'design')`);
  const prodDef = add(`PRODUCT_DEFINITION('design','',#${formation},#${defCtx})`);
  const prodDefShape = add(`PRODUCT_DEFINITION_SHAPE('','',#${prodDef})`);

  // units: millimetres
  const lengthUnit = add(`(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))`);
  const angleUnit = add(`(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))`);
  const solidAngleUnit = add(`(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())`);
  const uncertainty = add(
    `UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(0.001),#${lengthUnit},'distance_accuracy_value','')`,
  );
  const geomCtx = add(
    `(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${uncertainty}))GLOBAL_UNIT_ASSIGNED_CONTEXT((#${lengthUnit},#${angleUnit},#${solidAngleUnit}))REPRESENTATION_CONTEXT('',''))`,
  );

  // 8 vertices of the box
  const coords: [number, number, number][] = [
    [0, 0, 0], [dx, 0, 0], [dx, dy, 0], [0, dy, 0],
    [0, 0, dz], [dx, 0, dz], [dx, dy, dz], [0, dy, dz],
  ];
  const points = coords.map(([x, y, z]) => pt(x, y, z));
  const vertices = points.map((p) => add(`VERTEX_POINT('',#${p})`));

  // 12 edges, each a LINE from vertex a to vertex b
  const edgeDefs: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 0], // bottom e0..e3
    [4, 5], [5, 6], [6, 7], [7, 4], // top e4..e7
    [0, 4], [1, 5], [2, 6], [3, 7], // verticals e8..e11
  ];
  const edges = edgeDefs.map(([a, b]) => {
    const [ax, ay, az] = coords[a];
    const [bx, by, bz] = coords[b];
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    const d = dir((bx - ax) / len, (by - ay) / len, (bz - az) / len);
    const v = add(`VECTOR('',#${d},1.)`);
    const p = pt(ax, ay, az);
    const ln = add(`LINE('',#${p},#${v})`);
    return add(`EDGE_CURVE('',#${vertices[a]},#${vertices[b]},#${ln},.T.)`);
  });

  // 6 faces: [edge index, forward?][] loops are CCW about the outward normal
  const faces: { loop: [number, boolean][]; origin: [number, number, number]; normal: [number, number, number]; ref: [number, number, number] }[] = [
    { loop: [[3, false], [2, false], [1, false], [0, false]], origin: [0, 0, 0], normal: [0, 0, -1], ref: [1, 0, 0] }, // bottom
    { loop: [[4, true], [5, true], [6, true], [7, true]], origin: [0, 0, dz], normal: [0, 0, 1], ref: [1, 0, 0] }, // top
    { loop: [[0, true], [9, true], [4, false], [8, false]], origin: [0, 0, 0], normal: [0, -1, 0], ref: [1, 0, 0] }, // front y=0
    { loop: [[1, true], [10, true], [5, false], [9, false]], origin: [dx, 0, 0], normal: [1, 0, 0], ref: [0, 1, 0] }, // right x=dx
    { loop: [[2, true], [11, true], [6, false], [10, false]], origin: [0, dy, 0], normal: [0, 1, 0], ref: [1, 0, 0] }, // back y=dy
    { loop: [[3, true], [8, true], [7, false], [11, false]], origin: [0, 0, 0], normal: [-1, 0, 0], ref: [0, 1, 0] }, // left x=0
  ];
  const faceIds = faces.map((f) => {
    const oriented = f.loop.map(([e, fwd]) =>
      add(`ORIENTED_EDGE('',*,*,#${edges[e]},${fwd ? ".T." : ".F."})`),
    );
    const loop = add(`EDGE_LOOP('',(${oriented.map((o) => `#${o}`).join(",")}))`);
    const bound = add(`FACE_OUTER_BOUND('',#${loop},.T.)`);
    const o = pt(...f.origin);
    const nrm = dir(...f.normal);
    const ref = dir(...f.ref);
    const ax = add(`AXIS2_PLACEMENT_3D('',#${o},#${nrm},#${ref})`);
    const plane = add(`PLANE('',#${ax})`);
    return add(`ADVANCED_FACE('',(#${bound}),#${plane},.T.)`);
  });

  const shell = add(`CLOSED_SHELL('',(${faceIds.map((f) => `#${f}`).join(",")}))`);
  const solid = add(`MANIFOLD_SOLID_BREP('',#${shell})`);
  const originPt = pt(0, 0, 0);
  const axisZ = dir(0, 0, 1);
  const axisX = dir(1, 0, 0);
  const placement = add(`AXIS2_PLACEMENT_3D('',#${originPt},#${axisZ},#${axisX})`);
  const shapeRep = add(
    `ADVANCED_BREP_SHAPE_REPRESENTATION('',(#${placement},#${solid}),#${geomCtx})`,
  );
  add(`SHAPE_DEFINITION_REPRESENTATION(#${prodDefShape},#${shapeRep})`);

  return `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('FirstCut demo block'),'2;1');
FILE_NAME('S-block.step','2026-01-01T00:00:00',('FirstCut'),('FirstCut'),'','','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));
ENDSEC;
DATA;
${ents.join("\n")}
ENDSEC;
END-ISO-10303-21;
`;
}

// ---------------------------------------------------------------- text fixtures

const TEXT_FIXTURES = [
  {
    id: "T1",
    label: "7075 bracket spec",
    text: "7075-T651, finished part 7.5 x 3.2 x 1.1, qty 4",
  },
  {
    id: "T2",
    label: "marine bracket, no temper",
    text: "need 12 pcs 5083 plate blanks for a marine bracket, 18 x 6 x 0.6 finished",
  },
  {
    id: "T3",
    label: "nonsense (graceful degradation)",
    text: "asdf give me a quote for vibes",
  },
];

// ---------------------------------------------------------------- entry point

export async function generateFixtures(): Promise<void> {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });

  for (const spec of DRAWINGS) {
    const bytes = await generateDrawing(spec);
    fs.writeFileSync(path.join(FIXTURES_DIR, spec.file), bytes);
  }

  // 152.4 × 101.6 × 25.4 mm = 6 × 4 × 1 in
  fs.writeFileSync(path.join(FIXTURES_DIR, "S-block.step"), generateBoxStep(152.4, 101.6, 25.4));

  fs.writeFileSync(
    path.join(FIXTURES_DIR, "text-fixtures.json"),
    JSON.stringify(TEXT_FIXTURES, null, 2) + "\n",
  );

  console.log(
    `Fixtures written to /fixtures: ${DRAWINGS.map((d) => d.file).join(", ")}, S-block.step, text-fixtures.json`,
  );
}

// Allow standalone execution: npx tsx scripts/generate-fixtures.ts
if (process.argv[1]?.endsWith("generate-fixtures.ts")) {
  generateFixtures().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
