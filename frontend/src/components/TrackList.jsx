import { IconNote, IconPlay, IconTrash } from './Icons';

export default function TrackList({ tracks, currentIndex, onPlay, onDelete, showDelete }) {
  if (tracks.length === 0) {
    return (
      <div className="empty-state">
        <IconNote size={48} />
        <h3>No tracks yet</h3>
        <p>Upload some music or load a demo album.</p>
      </div>
    );
  }

  return (
    <div className="track-list">
      <div className="track-list-header">
        <span>#</span>
        <span />
        <span>Title</span>
        <span>Artist</span>
        <span>Genre</span>
        <span />
      </div>
      {tracks.map((track, i) => (
        <div
          key={track.url_key}
          className={`track-row${i === currentIndex ? ' playing' : ''}`}
          onClick={() => onPlay(i)}
        >
          <span className="track-num">{i === currentIndex ? '▶' : i + 1}</span>
          {track.image_url ? (
            <img className="track-cover" src={track.image_url} alt={track.title} />
          ) : (
            <div className="track-cover-placeholder"><IconNote size={18} /></div>
          )}
          <div className="track-info">
            <div className="track-title">{track.title}</div>
            <div className="track-artist">{track.artist}</div>
          </div>
          <div className="track-album">{track.album_key || '—'}</div>
          <div className="track-genre">{track.genre || '—'}</div>
          <div className="track-actions">
            <button className="btn btn-ghost btn-sm" title="Play" onClick={(e) => { e.stopPropagation(); onPlay(i); }}>
              <IconPlay size={14} />
            </button>
            {showDelete && onDelete && (
              <button className="btn btn-ghost btn-sm" title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(track.url_key); }}>
                <IconTrash size={14} />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
