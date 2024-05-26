import React, { useEffect, useId, useRef, useState } from 'react';
import ReactDOMServer from "react-dom/server";
import { useSearchParams } from "react-router-dom";
import './App.css';
import { GeoJSON, LayersControl, MapContainer, ScaleControl, WMSTileLayer, useMap, useMapEvents } from 'react-leaflet';
import L, { LatLng, LatLngTuple } from 'leaflet';
import { Feature, FeatureCollection } from 'geojson';
import iso3166 from 'iso-3166-2';

type PropertyDefinition = {
  name: string;
  level: "nominal" | "ordinal" | "rational";
};
type GeoquizParameters = {
  items?: string;
  properties: PropertyDefinition[];
};

// TODO make ignored words configurable in the file
const ignoredWords = ["peak", "mount", "mountain", "mt", "mont", "monte", "montana", "pico", "de", "volcano", "volcan", "la", "el", "the"];

const normalize = (s : string) => s.trim().toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s]+/g, "").split(/\s+/).filter(
  part => !ignoredWords.includes(part)
).map(part => {
  // TODO define more abbreviations
  if (part === "saint") {
    return "st";
  }
  return part;
})
.join(" ");

function isMatch(guess : string, answer : Feature) : boolean {
  const guessNormalized = normalize(guess);
  // TODO make matching field(s)/expression configurable in the file
  const answerNormalized = normalize(answer.properties?.["title"]);
  return guessNormalized === answerNormalized;
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
    fname : string | null,
    // TODO make these URL param filters general
    prominence : string | null,
    elevation : string | null,
    countries : string[],
    states : string[]
  ) => {
    if (!fname && !prominence && !elevation && countries.length === 0 && states.length === 0) {
      return;
    }
    // TODO switch the default file to something I have a license for
    fetch(`json/${fname ?? "test"}.json`,{
        headers : {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
         }
      })
      .then(res => res.json())
      .then(
        (result) => {
          // filter the features according to the parameters
          // TODO make these filters configurable
          const features = result.features.filter(
            (feature : Feature) =>
              feature.properties?.["prominenceFt"] >= parseInt(prominence ?? "300")
              && feature.properties?.["elevationFt"] >= parseInt(elevation ?? "0")
              && (countries.length === 0 || countries.some(country => feature.properties?.["country"].includes(country)))
              && (states.length === 0 || states.some(state => feature.properties?.["usState"].includes(state)))
          );
          // set any correct guesses
          const answers = Array.from(guesses).reduce<Feature[]>((acc, guess) => {
            const answersForGuess = features.filter((feature:Feature) => isMatch(guess, feature));
            return [...acc, ...answersForGuess];
          }, []);
          if (answers && answers.length) {
            setCorrect(new Set([...answers, ...correct.values()]));
          }
          // set the data
          setData({...result, features});
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
  // TODO these filters and URL params should be configurable
  const [prominence, setProminence] = useState(urlParams.get("p"));
  const [elevation, setElevation] = useState(urlParams.get("e"));
  const [countries, setCountries] = useState(urlParams
  .get("c")
  ?.split(",")
  .reduce<string[]>((arr, s) => {
    const isoResult = iso3166.country(s.toUpperCase())?.name;
    if (isoResult) {
      return [...arr, isoResult];
    }
    return arr;
  }, []) ?? []);
  const [states, setStates] = useState(urlParams
    .get("s")
    ?.split(",")
    .reduce<string[]>((arr, s) => {
      const isoResult = iso3166.subdivision("US", s.toUpperCase())?.name;
      if (isoResult) {
        return [...arr, isoResult];
      }
      return arr;
    }, []) ?? []);
  useEffect(() => {
    processServerFile(file, prominence, elevation, countries, states);
  }, [file, prominence, elevation, countries, states]);

  const handleInput : React.FormEventHandler<HTMLInputElement> = (ev) => {
    setDraft(ev.currentTarget.value);
  };
  const handleSubmit : React.FormEventHandler<HTMLFormElement> = (ev) => {
    ev.preventDefault();
    if (draft && !guesses.has(draft)) {
      setGuesses(new Set([draft, ...guesses.values()]));
      const answers = data?.features.filter(v => isMatch(draft, v))
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
          <li><a href="?p=300&z=2&ll=50.85707%2C52.38281">World Peaks</a></li>
          <li><a href="?e=26246&p=1000&z=2&ll=50.85707%2C52.38281">World 8000m Peaks</a></li>
          <li><a href="?e=19685&z=2&ll=50.85707%2C52.38281">World 6000m Peaks</a></li>
          <li><a href="?c=ca,us,mx&z=3&ll=50.35023%2C-103.88672">North America Peaks</a></li>
          <li><a href="?f=us&c=us&z=3&ll=50.35023%2C-103.88672">United States Peaks</a></li>
          <li><a href="?f=us&s=wa,or,ca,nv,id,mt,wy,ut,co,az,nm&z=5&ll=40.26292%2C-108.19336">Western Contiguous United States Peaks</a></li>
          <li><a href="?f=us&s=me,nh,vt,ma,ct,ri&z=6&ll=43.58783%2C-68.95020">New England Peaks</a></li>
          <li><a href="?f=wa&s=wa&p=400&z=7&ll=47.35541%2C-120.81116">Washington Peaks</a></li>
          <li><a href="?f=us&s=vt&z=8&ll=43.79677%2C-71.83411">Vermont Peaks</a></li>
        </ul>
      </div>
    </div>
  }

  // TODO make the binning, summing, and ranking properties configurable
  const totalProminence = data.features.reduce((acc, curr) => acc + parseInt(curr.properties?.["prominenceFt"]), 0);
  const correctProminence = Array.from(correct).reduce((acc, curr) => acc + parseInt(curr.properties?.["prominenceFt"]), 0);

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
          >
          <LayersControl position="topright">
            <LayersControl.BaseLayer name="TNM Blank" checked>
              <WMSTileLayer {...baseLayer} />
            </LayersControl.BaseLayer>
            <LayersControl.Overlay name={"Shaded Relief"} checked>
              <WMSTileLayer {...overlay} />
            </LayersControl.Overlay>
          </LayersControl>
          <ChangeView />
          <ScaleControl position="bottomleft" />
          <StateMap geojson={correctFeatures} />
        </MapContainer>
      </div>
      <p>
        You have named {correct.size} ({Math.round(correct.size / data.features.length * 100)}%)
        of {data.features.length} {data.geoquiz?.items ?? "features"}.
      </p>
      <div id="result-container">
        {data.geoquiz?.properties.filter(p => p.level === "rational").map(p => (
          <RationalPropertyView
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
    </div>
  );
}

function RationalPropertyView(props : {
  correct : Feature[],
  all : Feature[],
  property: string,
  })
{
  const total = props.all.reduce((sum, feature) => sum + feature.properties?.[props.property], 0);
  const sumCorrect = props.correct.reduce((sum, feature) => sum + feature.properties?.[props.property], 0);
  const percentage = Math.round(sumCorrect / total * 100);

  // TODO include ranking of top correct ones and number of top "all" that were guessed
  // both ascending and descending
  return <div>
    <h3>{props.property}</h3>
    {total > 0 ? <p>Correct guesses account for {percentage}% of the total {props.property}.</p> : null}
  </div>
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

function ChangeView() : null {
  const [urlParams, setUrlParams] = useSearchParams();
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
  // TODO make the default map view configurable in the file
  if (!center && !zoom) {
    map.setView(
      urlParams.get("ll")?.split(",").map(s => parseFloat(s)) as LatLngTuple ?? [38.56347, -98.39355],
      parseInt(urlParams.get("z") ?? "5")
    );
  }
  return null;
}

const StateMap = (props : { geojson : FeatureCollection }) => {
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
      pointToLayer={(feature, latlng) => {
        const marker = new L.CircleMarker(
          latlng,
          {radius: 1 + parseInt(feature.properties?.["prominenceFt"]) / 1000}
        );
        marker.bindTooltip(`${feature.properties?.["title"]} (P${parseInt(feature.properties?.["prominenceFt"])}ft)`);
        marker.bindPopup(ReactDOMServer.renderToString(
          <PopupBody feature={feature} />
      ))
        return marker;
      }}
    />
  )
}

// TODO make these popup fields come from the file
const notableFields = ["title", "country", "usState", "elevationFt", "prominenceFt", "isolationMi", "orsMeters", "peakbaggerUrl"];

function PopupBody(props : {feature : Feature}) {
  return (
    <div style={{height: "150px", overflow: "auto"}}>
    <table><tbody>
      {notableFields.map((key) => {
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
