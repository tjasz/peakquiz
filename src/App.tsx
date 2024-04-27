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
  console.log({totalProminence, correctProminence})

  return (
    <div className="App">
      <header className="App-header">
        <p>PeakQuiz</p>
      </header>
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
        You have guessed {correct.size} ({Math.round(correct.size / data.features.length * 100)}%)
        of {data.features.length} peaks,
        accounting for {Math.round(correctProminence / totalProminence * 100)}%
        of the total prominence.
      </p>
      <div id="result-container">
        <div>
          <h3>All guesses ({guesses.size}):</h3>
          <p>{Math.round(correct.size / guesses.size * 100)}% success rate.</p>
          <ul>
            {Array.from(guesses).map(guess => (<li>{guess}</li>))}
          </ul>
        </div>
        <FilteredCorrectView
          correct={Array.from(correct)}
          all={data.features}
          predicate={(feature:Feature) => true}
          title="All correct peaks"
          />
        <FilteredCorrectView
          correct={Array.from(correct)}
          all={data.features}
          predicate={(feature:Feature) => parseInt(feature.properties?.["prominenceFt"]) > 1000}
          title="All correct P1000ft"
          />
        <FilteredCorrectView
          correct={Array.from(correct)}
          all={data.features}
          predicate={(feature:Feature) => parseInt(feature.properties?.["prominenceFt"]) > 2000}
          title="All correct P2000ft"
          />
        <FilteredCorrectView
          correct={Array.from(correct)}
          all={data.features}
          predicate={(feature:Feature) => parseInt(feature.properties?.["prominenceFt"]) > 3000}
          title="All correct P3000ft"
          />
        <FilteredCorrectView
          correct={Array.from(correct)}
          all={data.features}
          predicate={(feature:Feature) => parseInt(feature.properties?.["prominenceFt"]) > 5000}
          title="All correct P5000ft"
          />
      </div>
    </div>
  );
}

function FilteredCorrectView(props : {
  correct : Feature[],
  all : Feature[],
  predicate : (feature:Feature) => boolean,
  title : string})
  {
    const correctFiltered = props.correct.filter(props.predicate);
    const allFiltered = props.all.filter(props.predicate);
    return <div id="all-correct">
      <h3>{props.title} ({correctFiltered.length} of {allFiltered.length}):</h3>
      <ul>
        {correctFiltered.map(feature => (<li>{feature.properties?.["title"]}</li>))}
      </ul>
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
