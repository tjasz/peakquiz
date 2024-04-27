export enum FeatureType {
  Feature = "Feature",
  FeatureCollection = "FeatureCollection",
}

export enum GeometryType {
  Point = "Point",
  MultiPoint = "MultiPoint",
  LineString = "LineString",
  MultiLineString = "MultiLineString",
  Polygon = "Polygon",
  MultiPolygon = "MultiPolygon",
  GeometryCollection = "GeometryCollection",
}

export type Coordinate = number[];
export type PointCoordinates = Coordinate;
export type MultiPointCoordinates = PointCoordinates[];
export type LineStringCoordinates = Coordinate[];
export type MultiLineStringCoordinates = LineStringCoordinates[];
export type PolygonCoordinates = Coordinate[][];
export type MultiPolygonCoordinates = PolygonCoordinates[];

// allow additional string keys to map to any type
type Extension = {[index: string]: any}

export type Point = Extension & {
  type: GeometryType;
  coordinates: PointCoordinates;
}

export type MultiPoint = Extension & {
  type: GeometryType;
  coordinates: MultiPointCoordinates;
}

export type LineString = Extension & {
  type: GeometryType;
  coordinates: LineStringCoordinates;
}

export type MultiLineString = Extension & {
  type: GeometryType;
  coordinates: MultiLineStringCoordinates;
}

export type Polygon = Extension & {
  type: GeometryType;
  coordinates: PolygonCoordinates;
}

export type MultiPolygon = Extension & {
  type: GeometryType;
  coordinates: MultiPolygonCoordinates;
}

export type Geometry = Point | MultiPoint | LineString | MultiLineString | Polygon | MultiPolygon;

export type GeometryCollection = Extension & {
  type: GeometryType;
  geometries: Geometry[];
}

export type FeatureProperties = {[index: string]: any};

export type Feature = Extension & {
  type: FeatureType;
  geometry: Geometry | GeometryCollection;
  properties: FeatureProperties;
}

export type FeatureCollection = Extension & {
  type: FeatureType;
  features: Feature[];
}