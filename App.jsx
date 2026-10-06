import React from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Auth from './pages/Auth.jsx';
import Studio from './pages/Studio.jsx';
import Guest from './pages/Guest.jsx';
import Toaster from './components/Toaster.jsx';

function GuestRoute() {
  const { slug } = useParams();
  return <Guest slug={slug} />;
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/signup" element={<Auth mode="signup" />} />
        <Route path="/login" element={<Auth mode="login" />} />
        <Route path="/studio" element={<Studio />} />
        <Route path="/dashboard" element={<Navigate to="/studio" replace />} />
        <Route path="/:slug" element={<GuestRoute />} />
      </Routes>
      <Toaster />
    </>
  );
}
