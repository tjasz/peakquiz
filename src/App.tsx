import React, { useId, useState } from 'react';
import './App.css';

const answers = [
  "Rainier",
  "Baker",
  "St Helens",
  "Adams",
  "Glacier",
];

function App() {
  const id = useId();
  const [draft, setDraft] = useState<null|string>(null);
  const [guesses, setGuesses] = useState<Set<string>>(new Set<string>());
  const [correct, setCorrect] = useState<Set<string>>(new Set<string>());

  const handleInput : React.FormEventHandler<HTMLInputElement> = (ev) => {
    setDraft(ev.currentTarget.value);
  };
  const handleSubmit : React.FormEventHandler<HTMLFormElement> = (ev) => {
    ev.preventDefault();
    if (draft && !guesses.has(draft)) {
      setGuesses(new Set([...guesses.values(), draft]));
      const answer = answers.find(v => draft.toLowerCase().includes(v.toLowerCase()))
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
      <ul>
        {Array.from(guesses).map(guess => (<li>{guess}</li>))}
      </ul>
      <ul>
        {Array.from(correct).map(guess => (<li>{guess}</li>))}
      </ul>
    </div>
  );
}

export default App;
