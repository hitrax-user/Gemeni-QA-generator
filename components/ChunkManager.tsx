import React, { useState } from 'react';
import { Chunk } from '../types';
import { TrashIcon, SparklesIcon, LoaderIcon, CheckIcon, WarningIcon } from './icons';

interface ChunkManagerProps {
  chunks: Chunk[];
  addChunk: (start: number, end: number) => void;
  deleteChunk: (id: number) => void;
  selectChunk: (chunk: Chunk | null) => void;
  selectedChunkId: number | null;
  numPages: number;
  fileName: string;
  autoSplit: () => void;
  isAutoSplitting: boolean;
  hasOutline: boolean | null;
  isTextBased: boolean | null;
}

const ChunkManager: React.FC<ChunkManagerProps> = ({ chunks, addChunk, deleteChunk, selectChunk, selectedChunkId, numPages, fileName, autoSplit, isAutoSplitting, hasOutline, isTextBased }) => {
  const [startPage, setStartPage] = useState('');
  const [endPage, setEndPage] = useState('');
  const [error, setError] = useState('');

  const handleAddChunk = () => {
    setError('');
    const start = parseInt(startPage, 10);
    const end = parseInt(endPage, 10);

    if (isNaN(start) || isNaN(end) || start <= 0 || end <= 0) {
      setError('Page numbers must be greater than 0.');
      return;
    }
    if (start > end) {
      setError('Start page cannot be greater than end page.');
      return;
    }
    if (start > numPages || end > numPages) {
        setError(`Page number cannot be greater than ${numPages}.`);
        return;
    }
    if (end - start + 1 > 4) {
      setError('Chunk cannot exceed 4 pages.');
      return;
    }

    addChunk(start, end);
    setStartPage('');
    setEndPage('');
  };

  const handleAutoSplitClick = () => {
    if (chunks.length > 0 && !window.confirm("This will replace all existing chunks. Continue?")) {
        return;
    }
    autoSplit();
  };


  return (
    <div className="bg-slate-800/50 p-4 rounded-lg flex flex-col h-full">
      <h2 className="text-xl font-bold mb-1 text-indigo-300">Chunks</h2>
      <p className="text-sm text-slate-400 mb-1 truncate" title={fileName}>
        {fileName} ({numPages} pages)
      </p>

      <div className="mb-4">
        {isTextBased === true && (
            <div className="flex items-center gap-1.5 text-xs text-green-400 bg-green-900/50 rounded-full px-2 py-0.5 max-w-max">
                <CheckIcon className="w-3.5 h-3.5" />
                <span>Text-based Document</span>
            </div>
        )}
        {isTextBased === false && (
            <div title="Text extraction is not possible. Q&A generation will likely fail for this document." className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-900/50 rounded-full px-2 py-0.5 max-w-max cursor-help">
                <WarningIcon className="w-3.5 h-3.5" />
                <span>Image-only Document</span>
            </div>
        )}
      </div>

      <div className="bg-slate-900/70 p-4 rounded-md mb-4">
        <h3 className="font-semibold mb-3">Create Chunks</h3>
        
        <button
          onClick={handleAutoSplitClick}
          disabled={isAutoSplitting || hasOutline === false}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded-md transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed mb-2"
        >
          {isAutoSplitting ? <LoaderIcon className="w-5 h-5"/> : <SparklesIcon className="w-5 h-5" />}
          {isAutoSplitting ? 'Splitting...' : 'Split by Table of Contents'}
        </button>

        {hasOutline === false && (
            <p className="text-amber-400 text-xs text-center mt-2">Auto-split unavailable: document has no outline.</p>
        )}
        
        <div className="flex items-center my-4">
            <hr className="flex-grow border-t border-slate-700" />
            <span className="px-2 text-slate-500 text-sm">OR</span>
            <hr className="flex-grow border-t border-slate-700" />
        </div>

        <p className="font-semibold text-sm mb-2 text-slate-300">Add manually:</p>
        <div className="flex items-center gap-2 mb-2">
          <input
            type="number"
            value={startPage}
            onChange={(e) => setStartPage(e.target.value)}
            placeholder="From"
            min="1"
            max={numPages}
            className="w-full bg-slate-700 border border-slate-600 rounded-md px-2 py-1 text-center"
          />
          <span className="text-slate-400">-</span>
          <input
            type="number"
            value={endPage}
            onChange={(e) => setEndPage(e.target.value)}
            placeholder="To"
            min="1"
            max={numPages}
            className="w-full bg-slate-700 border border-slate-600 rounded-md px-2 py-1 text-center"
          />
        </div>
        <button
          onClick={handleAddChunk}
          className="w-full bg-slate-600 hover:bg-slate-500 text-white font-bold py-2 px-4 rounded-md transition-colors"
        >
          Add Chunk
        </button>
        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      </div>

      <div className="flex-grow overflow-y-auto pr-2 -mr-2">
        {chunks.length === 0 ? (
          <div className="text-center text-slate-500 py-8">
            <p>No chunks created.</p>
            <p className="text-sm">Use auto-split or add chunks manually.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {chunks.map((chunk) => (
              <li
                key={chunk.id}
                onClick={() => selectChunk(chunk)}
                className={`flex items-center justify-between p-3 rounded-md cursor-pointer transition-all ${
                  selectedChunkId === chunk.id ? 'bg-indigo-900/50 ring-2 ring-indigo-500' : 'bg-slate-700/50 hover:bg-slate-700'
                }`}
              >
                <div className="font-medium overflow-hidden">
                  <span className="font-bold">Chunk <span className="text-indigo-300">#{chunk.id}</span></span>
                  <p className="text-sm text-slate-400">Pages: {chunk.startPage} - {chunk.endPage}</p>
                   {chunk.contextTitle && (
                      <p className="text-xs text-slate-500 mt-1 truncate" title={chunk.contextTitle}>
                          Context: {chunk.contextTitle}
                      </p>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteChunk(chunk.id);
                  }}
                  className="p-1 text-slate-400 hover:text-red-400 rounded-full hover:bg-red-900/50 transition-colors flex-shrink-0 ml-2"
                  title="Delete chunk"
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ChunkManager;