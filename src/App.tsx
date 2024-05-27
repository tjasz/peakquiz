import React, { useEffect, useId, useRef, useState } from 'react';
import ReactDOMServer from "react-dom/server";
import { useSearchParams } from "react-router-dom";
import './App.css';
import { GeoJSON, LayersControl, MapContainer, ScaleControl, WMSTileLayer, useMap, useMapEvents } from 'react-leaflet';
import L, { LatLng, LatLngBoundsLiteral, LatLngTuple } from 'leaflet';
import { Feature, FeatureCollection } from 'geojson';
import bbox from '@turf/bbox'
import iso3166 from 'iso-3166-2';
import { BBox } from '@turf/helpers';

type PropertyDefinition = {
  name: string;
  level: "nominal" | "ordinal" | "rational";
};
type GeoquizParameters = {
  items?: string;
  source?: string;
  sourceUrl?: string;
  ignoredWords?: string[];
  titleProperty?: string;
  altTitleProperties?: string[];
  properties?: PropertyDefinition[];
};

const normalize = (s : string, ignoredWords : string[]) =>
  s.trim().toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s]+/g, "").split(/\s+/).filter(
    part => !ignoredWords.includes(part)
  ).map(part => {
    if (part === "st") {
      return "saint";
    }
    if (part === "mt") {
      return "mount";
    }
    return part;
  })
  .join(" ");

function isMatch(
  guess : string,
  answer : Feature,
  titleProperty : string,
  altTitleProperties : string[],
  ignoredWords : string[]
) : boolean
{
  const guessNormalized = normalize(guess, ignoredWords);

  for (const property of [titleProperty, ...altTitleProperties]) {
    const value = answer.properties?.[property];
    if (value !== undefined) {
      const answerNormalized = normalize(value, ignoredWords);
      if (guessNormalized === answerNormalized) {
        return true;
      }
    }
  }

  return false;
}

const baseLayer = {
  type: "WMSTileLayer",
  name: "USGS TNM Blank",
  checked: false,
  layers: 'show%3A21',
  f: 'image',
  imageSR: 102100,
  bboxSR: 102100,
  format: 'png32',
  transparent: true,
  opacity: 1,
  dpi: 96,
  url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTNMBlank/MapServer/export",
  attribution: 'Map data &copy; <a href="https://basemap.nationalmap.gov/arcgis/rest/services/USGSTNMBlank/MapServer">USGS</a>',
};
const overlay = {
  type: "WMSTileLayer",
  name: "USGS Shaded Relief",
  checked: false,
  layers: 'show%3A21',
  f: 'image',
  imageSR: 102100,
  bboxSR: 102100,
  format: 'png32',
  transparent: true,
  opacity: 0.6,
  dpi: 96,
  url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSShadedReliefOnly/MapServer/export",
  attribution: 'Map data &copy; <a href="https://basemap.nationalmap.gov/arcgis/rest/services/USGSShadedReliefOnly/MapServer">USGS</a>',
};

function App() {
  const id = useId();
  const [urlParams, setUrlParams] = useSearchParams();
  const [draft, setDraft] = useState<null|string>(null);
  const [guesses, setGuesses] = useState<Set<string>>(() => {
    const saved = localStorage.getItem(window.location.href);
    if (!saved) return new Set();
    const initialValue = JSON.parse(saved);
    return new Set(initialValue);
  });
  const [correct, setCorrect] = useState<Set<Feature>>(new Set<Feature>());
  const [data, setData] = useState<FeatureCollection & {geoquiz?: GeoquizParameters}>();
  const correctFeatures : FeatureCollection = {
    type: "FeatureCollection",
    features: Array.from(correct),
  };
  
  const mapRef = useRef<L.Map>(null);
  const resizeMap = ( mapRef : React.MutableRefObject<L.Map | null>) => {
    const resizeObserver = new ResizeObserver(() => mapRef?.current?.invalidateSize())
    const container = document.getElementById('mapview')
    if (container) {
      resizeObserver.observe(container)
    }
  };

  // store guesses in local browser storage
  useEffect(() => {
    localStorage.setItem(window.location.href, JSON.stringify(Array.from(guesses)));
  }, [guesses]);

  const processServerFile = (
    fname : string | null
  ) => {
    if (!fname) {
      return;
    }
    fetch(`json/${fname}.json`,{
        headers : {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
         }
      })
      .then(res => res.json())
      .then(
        (result) => {
          const features = result.features;
          // set any correct guesses
          const answers = Array.from(guesses).reduce<Feature[]>((acc, guess) => {
            const answersForGuess = features.filter((feature:Feature) => isMatch(
              guess,
              feature,
              result?.geoquiz?.titleProperty ?? "title",
              result?.geoquiz?.altTitleProperties ?? [],
              result?.geoquiz?.ignoredWords ?? []
            ));
            return [...acc, ...answersForGuess];
          }, []);
          if (answers && answers.length) {
            setCorrect(new Set([...answers, ...correct.values()]));
          }
          // set the data
          setData(result);
        },
        // Note: it's important to handle errors here
        // instead of a catch() block so that we don't swallow
        // exceptions from actual bugs in components.
        (error) => {
          alert(error);
        }
      )
  };
  const [file, setFile] = useState(urlParams.get("f"));
  useEffect(() => {
    processServerFile(file);
  }, [file]);

  const handleInput : React.FormEventHandler<HTMLInputElement> = (ev) => {
    setDraft(ev.currentTarget.value);
  };
  const handleSubmit : React.FormEventHandler<HTMLFormElement> = (ev) => {
    ev.preventDefault();
    if (draft && !guesses.has(draft)) {
      setGuesses(new Set([draft, ...guesses.values()]));
      const answers = data?.features.filter(v => isMatch(
        draft,
        v,
        data?.geoquiz?.titleProperty ?? "title",
        data?.geoquiz?.altTitleProperties ?? [],
        data?.geoquiz?.ignoredWords ?? []
      ))
      if (answers && answers.length) {
        setCorrect(new Set([...answers, ...correct.values()]));
        setDraft(null);
      }
    } else {
      setDraft(null);
    }
  };
  if (!data) {
    return <div className="App">
      <header className="App-header">
        <p>GeoQuiz</p>
      </header>
      <div>
        <h3>Select a quiz:</h3>
        <ul>
          <li><a href="?f=uswild">U.S. Wilderness Areas</a></li>
        </ul>
      </div>
    </div>
  }

  return (
    <div className="App">
      <header className="App-header">
        <a href="?" className="App-link">GeoQuiz</a>
      </header>
      <p>
        How many of the <span className="highlighted">{data.features.length}</span> {data.geoquiz?.items ?? "features"} can you name?
      </p>
      <form onSubmit={handleSubmit}>
        <label htmlFor={id}>Guess:</label>
        <input type="text" id={id} value={draft ?? ""} onInput={handleInput} />
        <input type="submit" value="Submit" />
      </form>
      <div id="map">
        <MapContainer
          ref={mapRef}
          whenReady={() => resizeMap(mapRef)}
          zoomSnap={0}
          >
          <LayersControl position="topright">
            <LayersControl.BaseLayer name="TNM Blank" checked>
              <WMSTileLayer {...baseLayer} />
            </LayersControl.BaseLayer>
            <LayersControl.Overlay name={"Shaded Relief"} checked>
              <WMSTileLayer {...overlay} />
            </LayersControl.Overlay>
          </LayersControl>
          <ChangeView features={data} />
          <ScaleControl position="bottomleft" />
          <StateMap geojson={correctFeatures} config={data.geoquiz} />
        </MapContainer>
      </div>
      <p>
        You have named {correct.size} ({Math.round(correct.size / data.features.length * 100)}%)
        of {data.features.length} {data.geoquiz?.items ?? "features"}.
      </p>
      <div id="result-container">
        {data.geoquiz?.properties?.filter(p => p.level === "rational").map(p => (
          <RationalPropertyView
          key={p.name}
          config={data.geoquiz}
          correct={Array.from(correct)}
          all={data.features}
          property={p.name}
          />
        ))}
        {data.geoquiz?.properties?.filter(p => p.level === "ordinal").map(p => (
          <OrdinalPropertyView
          key={p.name}
          config={data.geoquiz}
          correct={Array.from(correct)}
          all={data.features}
          property={p.name}
          />
        ))}
        {data.geoquiz?.properties?.filter(p => p.level === "nominal").map(p => (
          <NominalPropertyView
          key={p.name}
          config={data.geoquiz}
          correct={Array.from(correct)}
          all={data.features}
          property={p.name}
          />
        ))}
        <GuessesView guesses={Array.from(guesses)} />
        <FilteredCorrectView
          correct={Array.from(correct)}
          all={data.features}
          />
      </div>
      <SourceAttribution config={data.geoquiz} />
    </div>
  );
}

function SourceAttribution(props : {config : GeoquizParameters | undefined}) {
  if (props.config?.source === undefined) return null;

  return <div id="source-attribution">
      <p>
      Data courtesy of {
        props.config.sourceUrl === undefined
          ? props.config.source 
          : <a href={props.config.sourceUrl}>{props.config.source}</a>
        }.
    </p>
  </div>
}

function NominalPropertyView(props : {
  config? : GeoquizParameters,
  correct : Feature[],
  all : Feature[],
  property: string,
  })
{
  const bins = new Set(
    props.all.map(f => f.properties?.[props.property])
  );

  const binCounts = new Map<any, number>();
  for (const bin of bins) {
    binCounts.set(bin, 0);
  }
  for (const f of props.all) {
    const val = f.properties?.[props.property];
    binCounts.set(val, (binCounts.get(val) ?? 0) + 1)
  }

  const correctBinCounts = new Map<any, number>();
  for (const bin of bins) {
    correctBinCounts.set(bin, 0);
  }
  for (const f of props.correct) {
    const val = f.properties?.[props.property];
    correctBinCounts.set(val, (correctBinCounts.get(val) ?? 0) + 1)
  }

  return <div>
    <h3>{props.property}</h3>
    <p>
      Named {props.config?.items ?? "features"} cover {Array.from(correctBinCounts.entries()).filter(([key, value]) => value > 0).length} of {Array.from(binCounts.keys()).length} values.
    </p>
    <ul>
      {Array.from(binCounts.keys()).map((key) => {
        const correct = correctBinCounts.get(key) ?? 0;
        const total = binCounts.get(key) ?? 0;
        return <li key={key}>
          <strong>{key}</strong>: {correct} of {total} ({Math.round(100 * correct / total)}%)
        </li>
      })}
    </ul>
  </div>
}

function sortBy(features : Feature[], property : string, asc : boolean = true) {
  return [...features].sort(
    (a, b) => {
      const ap = a.properties?.[property];
      const bp = b.properties?.[property];
      return (asc ? 1 : -1) * (ap === bp ? 0 : ap < bp ? -1 : 1);
    }
  );
}

function RationalPropertyView(props : {
  config? : GeoquizParameters,
  correct : Feature[],
  all : Feature[],
  property: string,
  })
{
  const total = props.all.reduce((sum, feature) => sum + feature.properties?.[props.property], 0);
  const sumCorrect = props.correct.reduce((sum, feature) => sum + feature.properties?.[props.property], 0);
  const percentage = Math.round(sumCorrect / total * 100);

  return <div>
    <h3>{props.property}</h3>
    {total > 0 ? <p>Correct guesses account for {percentage}% of the total {props.property}.</p> : null}
    <RankedList config={props.config} correct={props.correct} all={props.all} property={props.property} />
  </div>
}

function OrdinalPropertyView(props : {
  config? : GeoquizParameters,
  correct : Feature[],
  all : Feature[],
  property: string,
  })
{
  return <div>
    <h3>{props.property}</h3>
    <RankedList config={props.config} correct={props.correct} all={props.all} property={props.property} />
  </div>
}

function RankedList(props : {
  config? : GeoquizParameters,
  correct : Feature[],
  all : Feature[],
  property: string,
  })
{
  const definedCorrect = props.correct.filter(f => f.properties?.[props.property] !== undefined);
  const definedAll = props.all.filter(f => f.properties?.[props.property] !== undefined);

  const lowestCorrectTen = sortBy(definedCorrect, props.property).slice(0,10);
  const highestCorrectTen = sortBy(definedCorrect, props.property, false).slice(0,10);

  const lowestOverallTenCutoff = sortBy(definedAll, props.property)[Math.min(9, definedAll.length-1)]?.properties?.[props.property];
  const highestOverallTenCutoff = sortBy(definedAll, props.property, false)[Math.min(9, definedAll.length-1)]?.properties?.[props.property];

  return (
    <div>
      <h4>Named {props.config?.items ?? "features"} with highest {props.property}:</h4>
      <p>
        Includes
        &nbsp;{definedCorrect.filter(feature => feature.properties?.[props.property] >= highestOverallTenCutoff).length}
        &nbsp;of the top
        &nbsp;{definedAll.filter(feature => feature.properties?.[props.property] >= highestOverallTenCutoff).length}.
      </p>
      <ul>
        {highestCorrectTen.map((feature, idx) => (
          <li key={idx}>{feature.properties?.[props.config?.titleProperty ?? "title"]} ({feature.properties?.[props.property]})</li>
        ))}
      </ul>
      <h4>Named {props.config?.items ?? "features"} with lowest {props.property}:</h4>
      <p>
        Includes
        &nbsp;{definedCorrect.filter(feature => feature.properties?.[props.property] <= lowestOverallTenCutoff).length}
        &nbsp;of the bottom
        &nbsp;{definedAll.filter(feature => feature.properties?.[props.property] <= lowestOverallTenCutoff).length}.
      </p>
      <ul>
        {lowestCorrectTen.map((feature, idx) => (
          <li key={idx}>{feature.properties?.[props.config?.titleProperty ?? "title"]} ({feature.properties?.[props.property]})</li>
        ))}
      </ul>
    </div>
  );
}

function GuessesView(props: {guesses : string[]}) {
  const [showAll, setShowAll] = useState(false);

  return <div>
    <h3>All guesses ({props.guesses.length}):</h3>
    <ul>
      {props.guesses.slice(0, showAll ? props.guesses.length : 5).map(guess => (<li key={guess}>{guess}</li>))}
    </ul>
    <a className="App-link" onClick={() => setShowAll(!showAll)}>Show {showAll ? "less" : "more"}</a>
  </div>;
}

function FilteredCorrectView(props : {
  correct : Feature[],
  all : Feature[]
  })
  {
    // TODO make binning, summing, and ranking parameters configurable in the file
    const prominenceOptions = [300, 400, 1000, 2000, 3000, 5000, 10000];
    const elevationOptions = [0, 8000, 9000, 10000, 11000, 12000, 13000, 14000];
    const [prominenceCutoff, setProminenceCutoff] = useState(prominenceOptions[0]);
    const [elevationCutoff, setElevationCutoff] = useState(elevationOptions[0]);
    const [showAll, setShowAll] = useState(false);
    
    const predicate = (feature:Feature) =>
      parseInt(feature.properties?.["prominenceFt"]) >= prominenceCutoff &&
      parseInt(feature.properties?.["elevationFt"]) >= elevationCutoff;
    const correctFiltered = props.correct.filter(predicate);
    const allFiltered = props.all.filter(predicate);
    return <div id="all-correct">
      <h3>{correctFiltered.length} ({Math.round(correctFiltered.length / allFiltered.length * 100)}%) of {allFiltered.length} filtered peaks:</h3>
      <label htmlFor="prominenceCutoff">Prominence cutoff (ft):</label>
      <select name="prominenceCutoff" id="prominenceCutoff" onChange={(ev) => setProminenceCutoff(parseInt(ev.target.value))}>
        {prominenceOptions.map(op => <option key={op} value={op}>{op}</option>)}
      </select>
      <br />
      <label htmlFor="elevationCutoff">Elevation cutoff (ft):</label>
      <select name="elevationCutoff" id="elevationCutoff" onChange={(ev) => setElevationCutoff(parseInt(ev.target.value))}>
        {elevationOptions.map(op => <option key={op} value={op}>{op}</option>)}
      </select>
      <ul>
        {correctFiltered.slice(0, showAll ? correctFiltered.length : 5).map(feature => (
        <li key={feature.id}>
          <a className="App-link" target="_blank" href={feature.properties?.["peakbaggerUrl"]}>
            {feature.properties?.["title"]}
          </a>
        </li>
        ))}
      </ul>
      <a className="App-link" onClick={() => setShowAll(!showAll)}>Show {showAll ? "less" : "more"}</a>
    </div>
  }

function bboxToLatLngBounds(bbox : BBox) : LatLngBoundsLiteral {
  const len = bbox.length;
  return [[bbox[0], bbox[1]], [bbox[len/2], bbox[len/2 + 1]]];
}

function ChangeView(props : { features : FeatureCollection }) : null {
  const [center, setCenter] = useState<LatLng|null>(null);
  const [zoom, setZoom] = useState<number|null>(null);
  const map = useMap();
  const mapEvents = useMapEvents({
      zoomend: () => {
          setZoom(mapEvents.getZoom());
      },
      moveend: () => {
          setCenter(mapEvents.getCenter());
      },
  });
  if (!center && !zoom) {
    map.fitBounds(bboxToLatLngBounds(bbox(props.features)));
  }
  return null;
}

const StateMap = (props : { geojson : FeatureCollection, config? : GeoquizParameters }) => {
  // get a ref to the underlying L.geoJSON
  const geoJsonRef = useRef<L.GeoJSON>(null)

  // set the data to new data whenever it changes
  useEffect(() => {
    if (geoJsonRef.current){
      geoJsonRef.current.clearLayers()   // remove old data
      geoJsonRef.current.addData(props.geojson) // might need to be geojson.features
    }
  }, [geoJsonRef, props.geojson])

  // TODO make the symbology come from the file
  return (
    <GeoJSON
      ref={geoJsonRef}
      data={props.geojson}
      pointToLayer={(feature, latlng) =>
        new L.CircleMarker(
          latlng,
          {radius: 1 + parseInt(feature.properties?.["prominenceFt"]) / 1000}
        )}
      onEachFeature={(feature, layer) => {
        layer.bindPopup(
          ReactDOMServer.renderToString(
              <PopupBody feature={feature} />
          )
        );
        layer.bindTooltip(feature.properties?.[props.config?.titleProperty ?? "title"]);
      }}
    />
  )
}

function PopupBody(props : {feature : Feature}) {
  return (
    <div style={{height: "150px", overflow: "auto"}}>
    <table><tbody>
      {Object.keys(props.feature.properties ?? {}).map((key) => {
        const value = props.feature.properties?.[key];
        return <tr key={key}>
        <th>{key}</th>
        <td>
          {(value === "" ? undefined :
            typeof value === "string" && value.startsWith("http")
            ? <a target="_blank" href={value}>...{value.slice(-17)}</a>
            : typeof value === "string" || typeof value === "number"
                  ? value
                  : JSON.stringify(value)
          )}
        </td>
      </tr>
      })}
    </tbody></table>
    </div>
  );
}

export default App;
