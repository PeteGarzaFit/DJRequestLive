import React from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Auth from './pages/Auth.jsx';
import Studio from './pages/Studio.jsx';
import Guest from './pages/Guest.jsx';
import BridgeDownload from './pages/BridgeDownload.jsx';
import Intelligence from './pages/Intelligence.jsx';
import Curator from './pages/Curator.jsx';
import NightOf from './pages/NightOf.jsx';
import WeddingPlanner from './pages/WeddingPlanner.jsx';
import EventPlanner from './pages/EventPlanner.jsx';
import EventPlans from './pages/EventPlans.jsx';
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
        <Route path="/bridge" element={<BridgeDownload />} />
        <Route path="/intelligence" element={<Intelligence />} />
        <Route path="/curate" element={<Curator />} />
        <Route path="/wedding-planner" element={<WeddingPlanner />} />
        <Route path="/wedding/:token" element={<WeddingPlanner shared />} />
        <Route path="/wedding-planner/:token" element={<WeddingPlanner shared />} />
        <Route path="/event-planner" element={<EventPlanner />} />
        <Route path="/plans" element={<EventPlans />} />
        <Route path="/events" element={<EventPlans />} />
        <Route path="/weddings" element={<EventPlans />} />
        <Route path="/event-plan/:token" element={<EventPlanner shared />} />
        <Route path="/event" element={<NightOf />} />
        <Route path="/dashboard" element={<Navigate to="/studio?tab=queue" replace />} />
        <Route path="/:slug" element={<GuestRoute />} />
      </Routes>
      <Toaster />
    </>
  );
}
