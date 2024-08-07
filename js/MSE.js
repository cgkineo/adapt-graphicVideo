import MP4Box from './mp4box';

/**
 * Allows derivation of start, end and length from discrete value sets
 */
class DiscreteRange {
  constructor(start = null, end = null, length = null) {
    const validItems = [start, end, length].filter(a => a !== null).length;
    const missingItem = [start, end, length].findIndex(a => a === null);
    if (validItems < 2) throw new Error('Cannot derive DiscreteRange with less than two missing values');
    if (validItems === 2 && missingItem === 2) {
      this.start = start;
      this.end = end;
      this.length = (end - start) + 1;
    } else if (validItems === 3) {
      this.start = start;
      this.end = end;
      this.length = length;
    } else if (validItems === 2 && missingItem === 0) {
      this.start = (end - (length - 1));
      this.end = end;
      this.length = length;
    } else if (validItems === 2 && missingItem === 1) {
      this.start = start;
      this.end = (start + (length - 1));
      this.length = length;
    }
  }
}

/**
 * Uses MediaSource extensions to load file data of any mime type into
 * a video tag in safari on ipados, osx and ios
 * https://developer.mozilla.org/en-US/docs/Web/API/Media_Source_Extensions_API
 * https://www.radiantmediaplayer.com/blog/at-last-safari-17.1-now-brings-the-new-managed-media-source-api-to-iphone.html
 * https://github.com/w3c/media-source/issues/320
 *
 */
class MSE {
  constructor({
    video,
    src,
    bufferSeconds = 4,
    bufferLength = (1024 * 512) // 0.5mb
  }) {
    this.loadData = this.loadData.bind(this);
    this.onVideoTimeUpdate = this.onVideoTimeUpdate.bind(this);
    this.onMetaInfoError = this.onMetaInfoError.bind(this);
    this.onMetaInfoReady = this.onMetaInfoReady.bind(this);
    this.onMediaBufferUpdated = this.onMediaBufferUpdated.bind(this);
    this.onMediaBufferErrored = this.onMediaBufferErrored.bind(this);
    this.onStartStreaming = this.onStartStreaming.bind(this);
    this.onEndStreaming = this.onEndStreaming.bind(this);
    this.video = video;
    this.src = src;
    this.bufferSeconds = bufferSeconds;
    this.bufferLength = bufferLength;
    this.contentLength = Number.MAX_SAFE_INTEGER;
    this.metaInfoBuffers = [];
    this.metaInfo = null;
    this.isLoading = false;
    this.isStreaming = false;
    // configure for safari
    this.video.crossOrigin = 'anonymous';
    this.video.disableRemotePlayback = true;
    this.video.controls = false;
    const MediaSource = MSE.MediaSource;
    if (!MediaSource) return;
    // meta parser
    this.metaSource = MP4Box.createFile();
    this.metaSource.onError = this.onMetaInfoError;
    this.metaSource.onReady = this.onMetaInfoReady;
    // media parser
    this.mediaSource = new MediaSource();
    this.mediaSource.addEventListener('sourceopen', this.loadData);
    this.mediaSource.addEventListener('startstreaming', this.onStartStreaming);
    this.mediaSource.addEventListener('endstreaming', this.onEndStreaming);
    // video tag plumbing
    this.video.addEventListener('timeupdate', this.onVideoTimeUpdate);
    this.video.addEventListener('stalled', this.onVideoTimeUpdate);
    this.video.src = window.URL.createObjectURL(this.mediaSource);
  }

  async loadData() {
    if (this.isLoading) return;
    this.isLoading = true;
    this.lastByteRange = this.getNextByteRange();
    if (!this.lastByteRange?.length) return;
    // fetch the video data using the correct range headers
    const response = await fetch(this.src, { headers: { Range: `bytes=${this.lastByteRange.start}-${this.lastByteRange.end}` } });
    this.contentLength = MSE.parseContentHeaders(response).length;
    const buffer = await response.arrayBuffer();
    // data has loaded, either add to meta or media buffer
    if (!this.hasMetaInfo) return this.addToMetaBuffer(buffer);
    this.addToMediaBuffer(buffer);
  }

  get hasMetaInfo() {
    return this.metaInfo;
  }

  getNextByteRange() {
    // shortcut to initial range
    if (!this.lastByteRange) return new DiscreteRange(0, null, this.bufferLength);
    // go to start of next byte range
    const start = (this.lastByteRange.end + 1);
    // calculate if loading a full buffer length would be too much
    const isBeyondEnd = (start + this.bufferLength > this.contentLength);
    const length = isBeyondEnd ? this.contentLength - start : this.bufferLength;
    const nextRange = new DiscreteRange(start, null, length);
    return nextRange;
  }

  addToMetaBuffer(buffer) {
    // mp4box requires this
    buffer.fileStart = 0;
    // save the buffer for loading into the video later
    this.metaInfoBuffers.push(buffer.slice(0));
    // add to mp4box for analysis
    this.metaSource.appendBuffer(buffer);
    this.isLoading = false;
  }

  addToMediaBuffer(buffer) {
    // add to media source
    this.sourceBuffer.appendBuffer(buffer);
  }

  onMetaInfoError(err) {
    throw new Error(`Error loading meta ${err} for ${this.src} `);
  }

  onMetaInfoReady(metaInfo) {
    this.metaInfo = metaInfo;
    if (!MSE.MediaSource.isTypeSupported(this.mimeCodec)) {
      throw new Error(`Encoding not supported "${this.mimeCodec}" for ${this.src}`);
    }
    this.initializeMediaBuffer();
  }

  get mimeCodec() {
    return this.metaInfo?.mime ?? null;
  }

  initializeMediaBuffer() {
    // setup the media source buffer
    this.sourceBuffer = this.mediaSource.addSourceBuffer(this.mimeCodec);
    this.sourceBuffer.addEventListener('updateend', this.onMediaBufferUpdated);
    this.sourceBuffer.addEventListener('error', this.onMediaBufferErrored);
    // add meta buffers to media player
    this.metaInfoBuffers.forEach(buffer => this.sourceBuffer.appendBuffer(buffer));
    this.metaInfoBuffers.length = 0;
    this.metaSource.flush();
  }

  onMediaBufferUpdated() {
    if (!this.isLoading) return;
    this.isLoading = false;
    this.mediaSource.endOfStream();
    this.onVideoTimeUpdate();
  }

  onMediaBufferErrored() {
    throw new Error(`Error loading data: ${this.src} using mime codec: ${this.mimeCodec}`);
  }

  onVideoTimeUpdate() {
    if (this.isMediaSourceUpdating) return;
    this.estimateBufferLength();
    const shouldLoadMore = this.isStreaming || this.isBufferTooSmall;
    if (!shouldLoadMore) return;
    this.loadData();
  }

  get isMediaSourceUpdating() {
    return [...this.mediaSource.activeSourceBuffers].some(buf => buf.updating);
  }

  estimateBufferLength() {
    const hasLoadedData = (this.mediaSourceBufferTimeRangeEnd > 0);
    const bytes = this.contentLength;
    const seconds = this.mediaSource.duration;
    const canEstimateBufferLength = hasLoadedData && bytes && seconds;
    if (!canEstimateBufferLength) return;
    const estimatedBytesPerSecond = Math.round(bytes / seconds);
    this.bufferLength = estimatedBytesPerSecond * this.bufferSeconds;
  }

  get mediaSourceBufferTimeRangeEnd() {
    const maximumEndTime = [...this.mediaSource.activeSourceBuffers].reduce((max, buffer) => Math.max(buffer.buffered.end(0), max), 0);
    return maximumEndTime;
  }

  get isBufferTooSmall() {
    const timeRangeEnd = this.mediaSourceBufferTimeRangeEnd;
    const isBufferTooSmall = (this.video.currentTime + this.bufferSeconds >= timeRangeEnd);
    return isBufferTooSmall;
  }

  onStartStreaming() {
    /** ManagedMediaSource on safari only */
    this.isStreaming = true;
    this.onVideoTimeUpdate();
  }

  onEndStreaming() {
    /** ManagedMediaSource on safari only */
    this.isStreaming = false;
  }

  destroy() {
    try {
      this.mediaSource?.removeEventListener('sourceopen', this.loadData);
      this.mediaSource?.removeEventListener('startstreaming', this.onStartStreaming);
      this.mediaSource?.removeEventListener('endstreaming', this.onEndStreaming);
      this.video?.removeEventListener('timeupdate', this.onVideoTimeUpdate);
      this.video?.removeEventListener('stalled', this.onVideoTimeUpdate);
      this.sourceBuffer?.removeEventListener('updateend', this.onMediaBufferUpdated);
      this.sourceBuffer?.removeEventListener('error', this.onMediaBufferErrored);
      this.mediaSource?.removeSourceBuffer(this.sourceBuffer);
      this.mediaSource = null;
      this.video = null;
      this.sourceBuffer = null;
    } catch (err) {}
  }

  static get MediaSource() {
    const MediaSource = window.ManagedMediaSource || window.MediaSource;
    if (!MediaSource) throw new Error('No Media Source API available');
    return MediaSource;
  }

  static parseContentHeaders(response) {
    const typeRangeLength = response.headers.get('content-range');
    try {
      // try to parse the content-range header as "type start-end/length"
      if (typeRangeLength) {
        const [type, rangeLength] = typeRangeLength.split(' ');
        let [range, length] = rangeLength.split('/');
        length = parseInt(length);
        let [start, end] = range.split('-')[0];
        start = parseInt(start);
        end = parseInt(end);
        return { type, start, end, length };
      }
    } catch (err) {}
    // fallback to just the content-length
    const length = response.headers.get('content-length');
    return { type: 'all', start: 0, end: length - 1, length };
  }

}

export default MSE;
