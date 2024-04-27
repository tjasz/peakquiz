import React, { useId, useState } from 'react';
import './App.css';

function App() {
  const id = useId();
  const [draft, setDraft] = useState<null|string>(null);
  const [currentGuess, setCurrentGuess] = useState<null|string>(null);

  const handleInput : React.FormEventHandler<HTMLInputElement> = (ev) => {
    setDraft(ev.currentTarget.value);
  };
  const handleSubmit : React.FormEventHandler<HTMLFormElement> = (ev) => {
    ev.preventDefault();
    setCurrentGuess(draft);
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
      <p>{currentGuess}</p>
    </div>
  );
}

export default App;
