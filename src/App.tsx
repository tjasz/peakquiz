import React, { useEffect, useId, useRef, useState } from 'react';
import './App.css';
import { Feature, FeatureCollection } from './geojson';
import { LayersControl, MapContainer, WMSTileLayer } from 'react-leaflet';
import L, { Layer, TileLayerOptions, WMSOptions } from 'leaflet';


const ignoredWords = ["peak", "mount", "mountain"];

const normalize = (s : string) => s.trim().toLowerCase().replace(/[^a-z0-9\s]+/g, "").split(/\s+/).filter(
  part => !ignoredWords.includes(part)
).join(" ");

function isMatch(guess : string, answer : Feature) : boolean {
  const guessNormalized = normalize(guess);
  const answerNormalized = normalize(answer.properties["title"]);
  return guessNormalized === answerNormalized;
}

function App() {
  const id = useId();
  const [draft, setDraft] = useState<null|string>(null);
  const [guesses, setGuesses] = useState<Set<string>>(new Set<string>());
  const [correct, setCorrect] = useState<Set<Feature>>(new Set<Feature>());
  const [data, setData] = useState<FeatureCollection>();
  
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
  useEffect(() => {
    processServerFile("json/wa5000.json");
  }, []);

  const handleInput : React.FormEventHandler<HTMLInputElement> = (ev) => {
    setDraft(ev.currentTarget.value);
  };
  const handleSubmit : React.FormEventHandler<HTMLFormElement> = (ev) => {
    ev.preventDefault();
    if (draft && !guesses.has(draft)) {
      setGuesses(new Set([...guesses.values(), draft]));
      const answer = data?.features.find(v => isMatch(draft, v))
      if (answer) {
        setCorrect(new Set([...correct.values(), answer]));
      }
    }
    setDraft(null);
  };

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
              <WMSTileLayer url="https://basemap.nationalmap.gov/arcgis/rest/services/USGSTNMBlank/MapServer/export" />
            </LayersControl.BaseLayer>
          </LayersControl>
        </MapContainer>
      </div>
      <ul>
        {Array.from(guesses).map(guess => (<li>{guess}</li>))}
      </ul>
      <ul>
        {Array.from(correct).map(feature => (<li>{feature.properties["title"]}</li>))}
      </ul>
    </div>
  );
}

export default App;
