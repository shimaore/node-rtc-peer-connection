module.exports = (function(){

  var RTCSessionDescription = require('rtc-session-description');
  var SDP = require('sdp');

  var RTCPeerConnection = function(configuration,constraints) {
    this.localDescription = null; // a RTCSessionDescription
    this.remoteDescription = null; // a RTCSessionDescription

    this._localSession = null; // a SDP.Session
    this._remoteSession = null; // a SDP.Session

    // http://www.w3.org/TR/webrtc/#dom-peerconnection-signaling-state
    this.signalingState = 'stable';
    this.iceConnectionState = 'new';
    this.iceGatheringState = 'new';

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

    sdpOffer: null, // sdpOffer(success,failure) must be implemented by a descendant
    sdpAnswer: null, // sdpAnswer(success,failure)
    setLocalSession: null, // setLocalSession(session,success,failure)
    setRemoteSession: null, // setRemoteSession(session,success,failure)

    createOffer: function(success,failure,constraints) {
      // generate SDP: complete set (since this is an offer)
      this.sdpOffer(function(session) {
        var sdp = new RTCSessionDescription({type:'offer',sdp:session.toSDP});
        success(sdp);
      },failure);
    },

    createAnswer: function(success,failure,constraints) {
      // generate SDP: restricted set (since this is an answer)
      this.sdpAnswer(function(session) {
        // See http://datatracker.ietf.org/doc/draft-ietf-rtcweb-jsep/ for 'answer' vs 'pranswer'
        var sdp = new RTCSessionDescription({type:'answer',sdp:session.toSDP});
        success(sdp);
      },failure);
    },

    setLocalDescription: function(description,success,failure) {
      // If this RTCPeerConnection object's signaling state is closed, the user agent MUST throw an InvalidStateError exception and abort this operation.
      if(this.signalingState === 'closed') {
        throw new InvalidStateError();
      }
      // If a local description contains a different set of ICE credentials, then the ICE Agent MUST trigger an ICE restart.
      // Not-supported.

      var session = SDP.parse(description,this._localSession);

      if(!session) {
        if(this.signalingState !== 'closed') {
          failure({name:' InvalidSessionDescriptionError'}); // FIXME: should be DOMError
        }
      }

      this.setLocalSession(
        session,
        function() {
          // If connection's signaling state is closed, then abort these steps.
          if(this.signalingState === 'closed') {
            return
          }
          // Set connection's description attribute (localDescription or remoteDescription depending on the setting operation) to the RTCSessionDescription argument.
          this.localDescription = description;
          this._localSession = session;

          // If the local description was set, connection's ice gathering state is new, and the local description contains media, then set connection's ice gathering state to gathering.
          // If the local description was set with content that caused an ICE restart, then set connection's ice gathering state to gathering.
          if(this.iceGatheringState === 'new') {
            this.iceGatheringState = 'gathering';
          }

          // Set connection's signalingState accordingly.
          switch(this.signalingState + '.' + description.type) {
            case 'stable.answer':
              this.signalingState = 'have-local-offer';
              break;
            case 'have-local-offer.offer':
              // same state
              break;
            case 'have-remote-offer.answer':
              this.signalingState = 'stable';
              break;
            case 'have-remote-offer.pranswer':
              this.signalingState = 'have-local-pranswer';
              break;
            case 'have-local-pranswer.pranswer':
              // same state
              break;
            case 'have-local-pranswer.answer':
              this.signalingState = 'stable';
              break;
            // other state transitions are invalid, actually
          }

          // Fire a simple event named signalingstatechange at connection.
          if(this.onsignalingstatechange) {
            this.onsignalingstatechange({}); // FIXME: Event
          }
          // Queue a new task that, if connection's signalingState is not closed, invokes the successCallback.
          if(this.signalingState !== 'closed') {
            success();
          }

          // EXTRA: Simulate ICE gathering process is done:
          this.iceGatheringState = 'completed';
          if(this.onicecandidate) {
            this.onicecandidate(null);
          }
        },
        function() {
          if(this.signalingState !== 'closed') {
            failure({name:' IncompatibleSessionDescriptionError'});
          }
        }
      );
    },

    setRemoteDescription: function(description,success,failure) {
      // If this RTCPeerConnection object's signaling state is closed, the user agent MUST throw an InvalidStateError exception and abort this operation.
      if(this.signalingState === 'closed') {
        throw new InvalidStateError();
      }

      // FIXME: should we accumulate like this?
      var session = SDP.parse(description,this._remoteSession);

      if(!session) {
        if(this.signalingState !== 'closed') {
          failure({name:' InvalidSessionDescriptionError'}); // FIXME: should be DOMError
        }
      }

      this.setRemoteSession(
        session,
        function() {
          // If connection's signaling state is closed, then abort these steps.
          if(this.signalingState === 'closed') {
            return
          }
          // Set connection's description attribute (localDescription or remoteDescription depending on the setting operation) to the RTCSessionDescription argument.
          this.remoteDescription = description;
          this._remoteSession = session;

          // Set connection's signalingState accordingly.
          switch(this.signalingState + '.' + description.type) {
            case 'stable.offer':
              this.signalingState = 'have-remote-offer';
              break;
            case 'have-remote-offer.offer':
              // same state
              break;
            case 'have-local-offer.answer':
              this.signalingState = 'stable';
              break;
            case 'have-local-offer.pranswer':
              this.signalingState = 'have-remote-pranswer';
              break;
            case 'have-remote-pranswer.pranswer':
              // same state
              break;
            case 'have-remote-pranswer.answer':
              this.signalingState = 'stable';
              break;
            // other state transitions are invalid, actually
          }

          // Fire a simple event named signalingstatechange at connection.
          if(this.onsignalingstatechange) {
            this.onsignalingstatechange({}); // FIXME: Event
          }
          // Queue a new task that, if connection's signalingState is not closed, invokes the successCallback.
          if(this.signalingState !== 'closed') {
            success();
          }
        },
        function() {
          if(this.signalingState !== 'closed') {
            failure({name:' IncompatibleSessionDescriptionError'});
          }
        }
      );
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
    },

    _addRemoteStream: function(stream,constraints) {
      if(this.signalingState === 'closed') {
        throw new InvalidStateError();
      }
      if(this.getStreamById(stream.id)) {
        return;
      }
      this._remoteStreamSet.push(stream);
      if(this.signalingState === 'stable' && this.onaddstream) {
        this.onaddstream({stream:stream}); // FIXME: MediaStreamEvent
      }
    },

    _removeRemoteStream: function(stream) {
      if(this.signalingState === 'closed') {
        throw new InvalidStateError();
      }
      if(!this.getStreamById(stream.id)) {
        return;
      }
      this._remoteStreamSet = this._remoteStreamSet.filter(function(_){return _.id !== stream.id});
      if(this.signalingState === 'stable' && this.onremovestream) {
        this.onremovestream({stream:stream});
      }
    },

  };

  return RTCPeerConnection;
}());
