import React, { useEffect, useId, useRef, useState } from 'react';
import ReactDOMServer from "react-dom/server";
import { useSearchParams } from "react-router-dom";
import './App.css';
import { GeoJSON, LayersControl, MapContainer, ScaleControl, WMSTileLayer, useMap, useMapEvents } from 'react-leaflet';
import L, { LatLng } from 'leaflet';
import { Feature, FeatureCollection } from 'geojson';

const ignoredWords = ["peak", "mount", "mountain", "mt"];

const normalize = (s : string) => s.trim().toLowerCase().replace(/[^a-z0-9\s]+/g, "").split(/\s+/).filter(
  part => !ignoredWords.includes(part)
).map(part => {
  if (part === "saint") {
    return "st";
  }
  return part;
})
.join(" ");

function isMatch(guess : string, answer : Feature) : boolean {
  const guessNormalized = normalize(guess);
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

function App() {
  const id = useId();
  const [urlParams, setUrlParams] = useSearchParams();
  const [draft, setDraft] = useState<null|string>(null);
  const [guesses, setGuesses] = useState<Set<string>>(new Set<string>());
  const [correct, setCorrect] = useState<Set<Feature>>(new Set<Feature>());
  const [data, setData] = useState<FeatureCollection>();
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

  const processServerFile = (fname : string) => {
    fetch(fname,{
        headers : {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
         }
      })
      .then(res => res.json())
      .then(
        (result) => {
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
  const file = urlParams.get("f") ?? "wa";
  useEffect(() => {
    processServerFile(`json/${file}.json`);
  }, [file]);

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
    return null;
  }

  const totalProminence = data.features.reduce((acc, curr) => acc + parseInt(curr.properties?.["prominenceFt"]), 0);
  const correctProminence = Array.from(correct).reduce((acc, curr) => acc + parseInt(curr.properties?.["prominenceFt"]), 0);

  return (
    <div className="App">
      <header className="App-header">
        <p>PeakQuiz</p>
      </header>
      <p>How many of the <span className="highlighted">{data.features.length}</span> peaks can you name?</p>
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
          </LayersControl>
          <ChangeView />
          <ScaleControl position="bottomleft" />
          <StateMap geojson={correctFeatures} />
        </MapContainer>
      </div>
      <p>
        You have named {correct.size} ({Math.round(correct.size / data.features.length * 100)}%)
        of {data.features.length} peaks,
        accounting for {Math.round(correctProminence / totalProminence * 100)}%
        of the total prominence.
      </p>
      <div id="result-container">
        <GuessesView guesses={Array.from(guesses)} />
        <FilteredCorrectView
          correct={Array.from(correct)}
          all={data.features}
          />
      </div>
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
    map.setView([47.5,-122.3], 6);
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

const notableFields = ["title", "elevationFt", "prominenceFt", "isolationMi", "orsMeters", "peakbaggerUrl"];

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
