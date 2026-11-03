declare module 'world-atlas/land-110m.json' {
  import type { GeometryCollection, Topology } from 'topojson-specification';
  const land: Topology<{ land: GeometryCollection }>;
  export default land;
}
