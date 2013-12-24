module.exports = (function(PeerImplementation){

  var RTCSessionDescription = require('rtc-session-description');

  var RTCPeerConnection = function(configuration,constraints) {
    this.localDescription = null; // a RTCSessionDescription
    this.remoteDescription = null; // a RTCSessionDescription
    // http://www.w3.org/TR/webrtc/#dom-peerconnection-signaling-state
    this.signalingState = 'stable';
    this.iceGatheringState = 'completed'; // ICE not supported
    this.iceConnectionState = 'completed'; // ICE not supported

    this.onnegotiationneeded = null;
    this.onicecandidate = null;
    this.onsignalingstatechange = null;
    this.onaddstream = null;
    this.onremovestream = null;
    this.oniceconnectionstatechange = null;

    this._localStreamSet = []; // set of streams being sent from this object
    this._remoteStreamSet = []; // set of streams being received by this object
  };

  RTCPeerConnection.prototype = {

    createOffer: function(success,failure,constraints) {
      // generate SDP: complete set (since this is an offer)
      var rfc3264_sdp = PeerImplementation.sdpOffer(this);
      var sdp = new RTCSessionDescription({type:'offer',sdp:rfc3264_sdp});
      success(sdp);
    },

    createAnswer: function(success,failure,constraints) {
      // generate SDP: restricted set (since this is an answer)
      var rfc3264_sdp = PeerImplementation.sdpAnswer(this);
      // See http://datatracker.ietf.org/doc/draft-ietf-rtcweb-jsep/ for 'answer' vs 'pranswer'
      var sdp = new RTCSessionDescription({type:'answer',sdp:rfc3264_sdp});
      success(sdp);
    },

    setLocalDescription: function(description,success,failure) {
      // If this RTCPeerConnection object's signaling state is closed, the user agent MUST throw an InvalidStateError exception and abort this operation.
      if(this.signalingState === 'closed') {
        throw new InvalidStateError();
      }
      // If a local description contains a different set of ICE credentials, then the ICE Agent MUST trigger an ICE restart.
      // Not-supported.

      // ... Things are actually more complicated than that.
      this.localDescription = description;
      success();
    },

    setRemoteDescription: function(description,success,failure) {
      if(this.signalingState === 'closed') {
        throw new InvalidStateError();
      }
      // ...
      this.remoteDescription = description;

      // FIXME: build a new stream
      var stream = new MediaStream({type:'offer',sdp:this.remoteDescription});
      if(this.onaddstream) {
        this.onaddstream({stream:stream}); // FIXME: should be an Event
      }

      success();
    },

    updateIce: function(configuration,constraints) {
      // Do nothing, ICE not supported.
    },

    addIceCandidate: function(candidate,success,failure) {
      failure(new Error('addIceCandidate not implemented'));
    },

    getLocalStreams: function() {
      return this._localStreamSet;
    },

    getRemoteStreams: function() {
      return this._remoteStreamSet;
    },

    getStreamById: function(id) {
      return this._localStreamSet.filter(function(_){return _.id === id}).shift() ||
             this._remoteStreamSet.filter(function(_){return _.id === id}).shift();
    },

    addStream: function(stream,constraints) {
      // If connection's RTCPeerConnection signalingState is closed, throw an InvalidStateError exception and abort these steps.
      if(this.signalingState === 'closed') {
        throw new InvalidStateError();
      }
      // If stream is already in connection's local streams set, then abort these steps.
      if(this.getStreamById(stream.id)) {
        return;
      }

      // Add stream to connection's local streams set.
      this._localStreamSet.push(stream);

      // If connection's RTCPeerConnection signalingState is stable, then fire a negotiationneeded event at connection.
      if(this.signalingState === 'stable' && this.onnegotiationneeded) {
        this.onnegotiationneeded.apply(this);
      }
    },

    removeStream: function(stream) {
      // If connection's RTCPeerConnection signalingState is closed, throw an InvalidStateError exception.
      if(this.signalingState === 'closed') {
        throw new InvalidStateError();
      }
      // If stream is not in connection's local streams set, then abort these steps.
      if(!this.getStreamById(stream.id)) {
        return;
      }
      // Remove stream from connection's local streams set.
      this._localStreamSet = this._localStreamSet.filter(function(_){return _.id !== stream.id});

      // If connection's RTCPeerConnection signalingState is stable, then fire a negotiationneeded event at connection.
      if(this.signalingState === 'stable' && this.onnegotiationneeded) {
        this.onnegotiationneeded.apply(this);
      }
    },

    close: function () {
      // If the RTCPeerConnection object's RTCPeerConnection signalingState is closed, throw an InvalidStateError exception.
      if(this.signalingState === 'closed') {
        throw new InvalidStateError();
      }
      // Destroy the RTCPeerConnection ICE Agent, abruptly ending any active ICE processing and any active streaming, and releasing any relevant resources (e.g. TURN permissions).
      // ICE not supported
      // FIXME: stop active streaming

      // Set the object's RTCPeerConnection signalingState to closed.
      this.signalingState = 'closed';
    }
  };

  return RTCPeerConnection;
}());
