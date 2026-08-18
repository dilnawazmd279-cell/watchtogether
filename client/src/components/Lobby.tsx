import React, { useState, useEffect, useRef } from 'react';
import {
  Film,
  ArrowRight,
  Heart,
  Video,
  Lock,
  Tv,
  Mic,
  MessageCircle,
  Sparkles,
  Play,
  CheckCircle2,
} from 'lucide-react';
import { generateRoomId } from '../lib/config';
import { getRoomIdFromCurrentUrl } from '../lib/urlHelper';

interface LobbyProps {
  onJoinRoom: (roomId: string) => void;
  initialError?: string | null;
}

export const Lobby: React.FC<LobbyProps> = ({ onJoinRoom, initialError }) => {
  const [roomIdInput, setRoomIdInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError || null);
  const [isDirectInvite, setIsDirectInvite] = useState(false);
  const [invitedRoomId, setInvitedRoomId] = useState<string | null>(null);

  const joinInputRef = useRef<HTMLInputElement>(null);
  const howItWorksRef = useRef<HTMLElement>(null);

  // Check if room is present in URL on load
  useEffect(() => {
    const room = getRoomIdFromCurrentUrl();
    if (room) {
      setInvitedRoomId(room);
      setIsDirectInvite(true);
    }
  }, []);

  const handleCreateRoom = () => {
    const newRoomId = generateRoomId();
    onJoinRoom(newRoomId);
  };

  const handleJoinDirectInvite = () => {
    if (invitedRoomId) {
      onJoinRoom(invitedRoomId);
    }
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    let raw = roomIdInput.trim();
    if (!raw) {
      setErrorMessage('Please enter an invite code or link.');
      joinInputRef.current?.focus();
      return;
    }

    // If user pasted a full URL, extract the room code
    if (raw.includes('room=')) {
      const match = raw.match(/room=([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        raw = match[1];
      }
    } else if (raw.includes('/')) {
      const parts = raw.split('/');
      raw = parts[parts.length - 1];
    }

    raw = raw.toLowerCase().trim();
    if (raw.length < 3) {
      setErrorMessage('Please enter a valid room code.');
      joinInputRef.current?.focus();
      return;
    }

    onJoinRoom(raw);
  };

  const scrollToJoin = () => {
    joinInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    joinInputRef.current?.focus();
  };

  const scrollToHowItWorks = () => {
    howItWorksRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="landing-page-root">
      {/* =========================================================================
          LANDING NAVBAR
          ========================================================================= */}
      <header className="landing-nav-header">
        <div className="landing-nav-inner">
          <div className="landing-brand">
            <div className="landing-logo-mark">
              <Film size={18} className="logo-film-icon" />
            </div>
            <div className="landing-brand-text">
              <span className="brand-name">WATCH TOGETHER</span>
              <span className="brand-pill-tag">PRIVATE CINEMA</span>
            </div>
          </div>

          <div className="landing-nav-actions">
            <button onClick={scrollToHowItWorks} className="nav-link-btn">
              How It Works
            </button>
            <button onClick={scrollToJoin} className="nav-pill-btn">
              Join a Room
            </button>
          </div>
        </div>
      </header>

      {/* =========================================================================
          HERO SECTION: INTIMATE THEATER AMBIENCE
          ========================================================================= */}
      <section className="landing-hero-section">
        {/* Soft Theater Ambience Lighting */}
        <div className="hero-cinema-light-glow" />

        <div className="hero-content-wrap">
          {/* Eyebrow Badge */}
          <div className="hero-eyebrow-badge">
            <Heart size={13} className="eyebrow-heart" fill="currentColor" />
            <span>PRIVATE CINEMA FOR TWO</span>
          </div>

          {/* Main Headline */}
          <h1 className="hero-headline">
            Watch Together, <br className="hidden-mobile" />
            <span className="text-gradient-coral">Miles Apart.</span>
          </h1>

          {/* Support Line */}
          <p className="hero-subtext">
            Your private movie night, wherever you both are. <br className="hidden-mobile" />
            Watch, talk, laugh, and stay close — without being in the same room.
          </p>

          {/* Error Banner */}
          {errorMessage && (
            <div className="hero-error-banner" role="alert">
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Direct Invite Modal OR Primary CTA */}
          {isDirectInvite && invitedRoomId ? (
            <div className="hero-direct-invite-card">
              <div className="invite-glow-ring">
                <Heart size={28} className="invite-heart-icon" fill="currentColor" />
              </div>
              <h2 className="invite-card-title">You're invited to a private cinema</h2>
              <p className="invite-card-subtitle">
                Your partner is ready. Step inside to watch the movie together!
              </p>
              <button
                onClick={handleJoinDirectInvite}
                className="btn-hero-primary"
                id="join-invite-btn"
              >
                <span>Enter Cinema ❤️</span>
                <ArrowRight size={18} />
              </button>
              <button
                onClick={() => setIsDirectInvite(false)}
                className="btn-text-secondary"
              >
                or create your own room
              </button>
            </div>
          ) : (
            <div className="hero-cta-wrapper">
              <div className="hero-cta-row">
                <button
                  onClick={handleCreateRoom}
                  className="btn-hero-primary"
                  id="create-room-btn"
                >
                  <Sparkles size={18} />
                  <span>Create Private Cinema</span>
                  <ArrowRight size={18} />
                </button>
              </div>

              {/* Secondary Join Form */}
              <form onSubmit={handleJoinRoom} className="hero-join-form">
                <div className="hero-input-group">
                  <input
                    ref={joinInputRef}
                    type="text"
                    placeholder="Have an invite code or link?"
                    value={roomIdInput}
                    onChange={(e) => {
                      setRoomIdInput(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    className="hero-join-input"
                    id="join-room-input"
                    autoComplete="off"
                  />
                  <button
                    type="submit"
                    className="btn-hero-join"
                    id="join-room-btn"
                  >
                    Join
                  </button>
                </div>
              </form>

              {/* Reassurance Row */}
              <div className="hero-reassurance-row">
                <span>Private room</span>
                <span className="reassurance-dot">•</span>
                <span>Camera + voice</span>
                <span className="reassurance-dot">•</span>
                <span>Watch together</span>
              </div>
            </div>
          )}

          {/* =========================================================================
              HERO VISUAL: PURE HTML/CSS THEATER MOCKUP
              ========================================================================= */}
          <div className="hero-mockup-frame">
            <div className="mockup-screen-border">
              <div className="mockup-header-bar">
                <div className="mockup-dots">
                  <span className="dot dot-red" />
                  <span className="dot dot-yellow" />
                  <span className="dot dot-green" />
                </div>
                <div className="mockup-title-pill">
                  <Heart size={11} className="pill-heart" fill="currentColor" />
                  <span>Private Cinema • Together now</span>
                </div>
              </div>

              <div className="mockup-stage-grid">
                {/* Cinema Screen Mock */}
                <div className="mockup-main-screen">
                  <div className="mockup-video-glow" />
                  <div className="mockup-play-center">
                    <div className="play-pulse-ring">
                      <Play size={22} className="play-icon-mock" fill="currentColor" />
                    </div>
                    <span className="mockup-movie-title">Cinema Stream • 1080p Crystal Clear</span>
                  </div>
                </div>

                {/* Right Camera & Chat Preview */}
                <div className="mockup-sidebar">
                  <div className="mockup-cam-card partner-cam">
                    <div className="mockup-avatar-circle">
                      <Heart size={16} fill="currentColor" />
                    </div>
                    <div className="mockup-cam-footer">
                      <span>Partner</span>
                      <span className="mock-live-dot" />
                    </div>
                  </div>

                  <div className="mockup-cam-card you-cam">
                    <div className="mockup-avatar-circle">
                      <span>You</span>
                    </div>
                    <div className="mockup-cam-footer">
                      <span>You</span>
                      <span className="mock-live-dot" />
                    </div>
                  </div>

                  <div className="mockup-chat-preview">
                    <div className="mock-chat-bubble remote">
                      <span>"Look at that scene! ❤️"</span>
                    </div>
                    <div className="mock-chat-bubble local">
                      <span>"Haha I know right!"</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          PHASE 3: QUICK BENEFITS
          ========================================================================= */}
      <section className="landing-values-section">
        <div className="section-container">
          <div className="values-grid">
            <div className="value-card">
              <div className="value-icon-box icon-coral">
                <Film size={22} />
              </div>
              <h3 className="value-title">Watch Together</h3>
              <p className="value-desc">
                One private cinema room.
              </p>
            </div>

            <div className="value-card">
              <div className="value-icon-box icon-rose">
                <Video size={22} />
              </div>
              <h3 className="value-title">See Each Other</h3>
              <p className="value-desc">
                Keep cameras on while you watch.
              </p>
            </div>

            <div className="value-card">
              <div className="value-icon-box icon-gold">
                <MessageCircle size={22} />
              </div>
              <h3 className="value-title">Talk Naturally</h3>
              <p className="value-desc">
                Chat without leaving the movie.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          PHASE 4: HOW IT WORKS
          ========================================================================= */}
      <section className="landing-steps-section" ref={howItWorksRef}>
        <div className="section-container">
          <div className="section-header-center">
            <span className="section-tag">HOW IT WORKS</span>
            <h2 className="section-headline">Three Simple Steps</h2>
          </div>

          <div className="steps-grid">
            <div className="step-card">
              <span className="step-number">01</span>
              <h3 className="step-title">Create your private room</h3>
              <p className="step-desc">
                Start your room instantly with a single click.
              </p>
            </div>

            <div className="step-card">
              <span className="step-number">02</span>
              <h3 className="step-title">Send the invite</h3>
              <p className="step-desc">
                Share your private link with your person.
              </p>
            </div>

            <div className="step-card">
              <span className="step-number">03</span>
              <h3 className="step-title">Start movie night</h3>
              <p className="step-desc">
                Pick a movie, see each other, and enjoy.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          PHASE 5: EMOTIONAL SECTION
          ========================================================================= */}
      <section className="landing-narrative-section">
        <div className="section-container">
          <div className="narrative-box">
            <div className="narrative-icon-wrap">
              <Heart size={32} className="narrative-heart" fill="currentColor" />
            </div>
            <h2 className="narrative-title">Different cities. Same movie night.</h2>
            <p className="narrative-body">
              Your cinema doesn't need the same address.
            </p>
            <div className="narrative-badges">
              <div className="narrative-pill">
                <CheckCircle2 size={15} />
                <span>Private Two-Person Space</span>
              </div>
              <div className="narrative-pill">
                <CheckCircle2 size={15} />
                <span>Synchronized Audio & Video</span>
              </div>
              <div className="narrative-pill">
                <CheckCircle2 size={15} />
                <span>Side-by-Side Cameras</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          PHASE 6: FEATURE GRID
          ========================================================================= */}
      <section className="landing-features-section">
        <div className="section-container">
          <div className="section-header-center">
            <span className="section-tag">CINEMA FEATURES</span>
            <h2 className="section-headline">Everything in One Place</h2>
          </div>

          <div className="feature-grid">
            <div className="feature-card">
              <div className="feature-icon-circle icon-rose">
                <Tv size={24} />
              </div>
              <h3 className="feature-heading">Cinema</h3>
              <p className="feature-paragraph">
                Stream movies, YouTube, or browser tabs in one private room.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon-circle icon-blue">
                <Video size={24} />
              </div>
              <h3 className="feature-heading">Camera</h3>
              <p className="feature-paragraph">
                Keep your cameras on while you watch each other's reactions.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon-circle icon-gold">
                <Mic size={24} />
              </div>
              <h3 className="feature-heading">Voice</h3>
              <p className="feature-paragraph">
                Talk naturally and laugh together with crystal stereo sound.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon-circle icon-coral">
                <MessageCircle size={24} />
              </div>
              <h3 className="feature-heading">Chat</h3>
              <p className="feature-paragraph">
                Send thoughts and private reactions without covering the movie.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          TRUST / PRIVACY SECTION
          ========================================================================= */}
      <section className="landing-privacy-section">
        <div className="section-container">
          <div className="privacy-card">
            <div className="privacy-icon-wrap">
              <Lock size={24} />
            </div>
            <div>
              <h3 className="privacy-title">Built for private watch nights.</h3>
              <p className="privacy-desc">
                Your movie session stays between the two people in the room.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          PHASE 7: FINAL CALL TO ACTION
          ========================================================================= */}
      <section className="landing-final-cta-section">
        <div className="section-container">
          <div className="final-cta-card">
            <div className="cta-ambient-glow" />
            <h2 className="final-cta-title">Tonight's movie is only a click away.</h2>
            <p className="final-cta-subtitle">
              Send the invite. Pick the movie. Start watching.
            </p>
            <button
              onClick={handleCreateRoom}
              className="btn-hero-primary btn-large-cta"
            >
              <Heart size={18} fill="currentColor" />
              <span>Create Private Cinema</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* =========================================================================
          PHASE 8: MINIMAL FOOTER
          ========================================================================= */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="footer-brand">
            <span className="footer-brand-name">WATCH TOGETHER</span>
            <span className="footer-tagline">PRIVATE CINEMA</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
