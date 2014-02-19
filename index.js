module.exports = (function(){

  var RTCSessionDescription = require('rtc-session-description');
  var SDP = require('sdp');

  var RTCPeerConnection = function(configuration,constraints) {
    this.configuration = configuration;
    this.constraints = constraints;

    this.id = (new Date()).valueOf();
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

    localSDPSession: function() {
      // generate SDP: complete set (since this is an offer)

      var media = [];
      // Flattens media and tracks. This should use RFC3388 instead.
      this._localStreamSet.forEach(function(m) {
        var d = m.description();
        if(d.length) {
          d.forEach(function(track) {
            media.push(track);
          });
        } else {
          media.push(d);
        }
      });

      var session = new SDP.Session({
        origin: {
          username: 'RTCPeerConnection',
          sessionID: this.id,
          sessionVersion: 1,
          netType: 'IN',
          addrType: 'IP4',
          address: (this.configuration.signalling ? this.configuration.signalling.address : null) || '127.0.0.1'
        },
        media: media
      });
      return session;
    },

    createOffer: function(success,failure,constraints) {
      // generate SDP: complete set (since this is an offer)
      var session = this.localSDPSession();
      var sdp = new RTCSessionDescription({type:'offer',sdp:session.toSDP()});
      success(sdp);
    },

    createAnswer: function(success,failure,constraints) {
      // generate SDP: restricted set (since this is an answer)
      var session = this.localSDPSession();
      // See http://datatracker.ietf.org/doc/draft-ietf-rtcweb-jsep/ for 'answer' vs 'pranswer'
      var sdp = new RTCSessionDescription({type:'answer',sdp:session.toSDP()});
      success(sdp);
    },

    setLocalSession: function(session,success,failure) {
      // FIXME: Should negotiate SDP content.
      this._localSession = session;
      success();
    },

    setRemoteSession: function(session,success,failure) {
      // FIXME: Should negotiate SDP content.
      this._remoteSession = session;
      success();
    },

    setLocalDescription: function(description,success,failure) {
      var self = this;
      // If this RTCPeerConnection object's signaling state is closed, the user agent MUST throw an InvalidStateError exception and abort this operation.
      if(this.signalingState === 'closed') {
        throw new InvalidStateError();
      }
      // If a local description contains a different set of ICE credentials, then the ICE Agent MUST trigger an ICE restart.
      // Not-supported.

      var session = SDP.parse(description.sdp,this._localSession);

      if(!session) {
        if(this.signalingState !== 'closed') {
          failure({name:' InvalidSessionDescriptionError'}); // FIXME: should be DOMError
        }
      }

      this.setLocalSession(
        session,
        function() {
          // If connection's signaling state is closed, then abort these steps.
          if(self.signalingState === 'closed') {
            return
          }
          // Set connection's description attribute (localDescription or remoteDescription depending on the setting operation) to the RTCSessionDescription argument.
          self.localDescription = description;
          self._localSession = session;

          // If the local description was set, connection's ice gathering state is new, and the local description contains media, then set connection's ice gathering state to gathering.
          // If the local description was set with content that caused an ICE restart, then set connection's ice gathering state to gathering.
          if(self.iceGatheringState === 'new') {
            self.iceGatheringState = 'gathering';
          }

          // Set connection's signalingState accordingly.
          switch(self.signalingState + '.' + description.type) {
            case 'stable.answer':
              self.signalingState = 'have-local-offer';
              break;
            case 'have-local-offer.offer':
              // same state
              break;
            case 'have-remote-offer.answer':
              self.signalingState = 'stable';
              break;
            case 'have-remote-offer.pranswer':
              self.signalingState = 'have-local-pranswer';
              break;
            case 'have-local-pranswer.pranswer':
              // same state
              break;
            case 'have-local-pranswer.answer':
              self.signalingState = 'stable';
              break;
            // other state transitions are invalid, actually
          }

          // Fire a simple event named signalingstatechange at connection.
          if(self.onsignalingstatechange) {
            self.onsignalingstatechange({}); // FIXME: Event
          }
          // Queue a new task that, if connection's signalingState is not closed, invokes the successCallback.
          if(self.signalingState !== 'closed') {
            success();
          }

          // EXTRA: Simulate ICE gathering process is done:
          self.iceGatheringState = 'completed';
          if(self.onicecandidate) {
            self.onicecandidate({ candidate: null }); // FIXME candidate
          }
        },
        function() {
          if(self.signalingState !== 'closed') {
            failure({name:' IncompatibleSessionDescriptionError'});
          }
        }
      );
    },

    setRemoteDescription: function(description,success,failure) {
      var self = this;
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
          if(self.signalingState === 'closed') {
            return
          }
          // Set connection's description attribute (localDescription or remoteDescription depending on the setting operation) to the RTCSessionDescription argument.
          self.remoteDescription = description;
          self._remoteSession = session;

          // Set connection's signalingState accordingly.
          switch(self.signalingState + '.' + description.type) {
            case 'stable.offer':
              self.signalingState = 'have-remote-offer';
              break;
            case 'have-remote-offer.offer':
              // same state
              break;
            case 'have-local-offer.answer':
              self.signalingState = 'stable';
              break;
            case 'have-local-offer.pranswer':
              self.signalingState = 'have-remote-pranswer';
              break;
            case 'have-remote-pranswer.pranswer':
              // same state
              break;
            case 'have-remote-pranswer.answer':
              self.signalingState = 'stable';
              break;
            // other state transitions are invalid, actually
          }

          // Fire a simple event named signalingstatechange at connection.
          if(self.onsignalingstatechange) {
            self.onsignalingstatechange({}); // FIXME: Event
          }
          // Queue a new task that, if connection's signalingState is not closed, invokes the successCallback.
          if(self.signalingState !== 'closed') {
            success();
          }
        },
        function() {
          if(self.signalingState !== 'closed') {
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

      // stop active streaming
      this._localStreamSet.map( function(m) { m.stop(); });
      this._remoteStreamSet.map( function(m) { m.stop(); });

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
