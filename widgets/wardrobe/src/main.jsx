import React from 'react';
import {createRoot} from 'react-dom/client';
import {App} from './App';
import {createWardrobeHost} from './host.mjs';
import './styles.css';
import './production.css';
import './theme.css';
createRoot(document.getElementById('wardrobe-root')).render(<App host={createWardrobeHost()}/>);
