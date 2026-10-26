# Audio sources — Last Light 0.7

## Recorded helicopter loop

Runtime file: `public/audio/rotor-loop.wav`.

- Original work: **Helicopter over quiet neighbourhood - 2**, by **ezwa**.
- Recorded work dated **2008-11-12**; Commons archive uploaded **2013-01-19**.
- Author/licensing record: https://commons.wikimedia.org/wiki/File:Helicopter_over_quiet_n.ogg
- Exact source file: https://upload.wikimedia.org/wikipedia/commons/b/b8/Helicopter_over_quiet_n.ogg
- Original PDSounds record: http://www.pdsounds.org/sounds/helicopter_over_quiet_n (record 670; preserved by Wikimedia).
- License: **public-domain dedication by the author**, recorded as PD-author on Commons. The recorded permission allows use for any purpose, including commercial use, modification and redistribution; this is not a CC BY-SA license on the sound. The site's page-text license is separate from the audio license.
- Author-license explanation: https://commons.wikimedia.org/wiki/Template:PD-author
- Retrieved and processed **2026-10-23**; process record timestamp **2026-10-23T09:54:16.028923+00:00**.

Source archive: `audio-sources/v0.6/ezwa-helicopter-source.ogg`, 617,468 bytes, 44,100 Hz mono, 45.1657 seconds. SHA-256:

`54901df00d5f74d64e3b6e14aef64cdb17490dab6e315856055128206e3508d0`

Derivative: a 6.000-second mono PCM16 WAV at 48,000 Hz, 576,044 bytes. Extracted source seconds 18.25–24.85; removed DC, applied smooth 45 Hz high-pass / 4.4 kHz low-pass, resampled and used a 0.6-second complementary raised-cosine overlap across the loop boundary. The source is not pitch-shifted and no film/game audio, music, dialogue or synthetic oscillator is added. Peak is **−1.5003 dBFS**, RMS **−14.4382 dBFS**, with zero clipped samples. Final WAV SHA-256:

`361f5fde9c3de6486867a2bc354580b2c202bb20f91bf96f591cf747741f8572`

The source describes a natural helicopter flying over a quiet neighbourhood; it does not identify the aircraft model. **This is not a verified UH-60 recording or a reconstruction of the sound of the 1993 battle.** The file is suitable as a recorded rotor/engine layer beneath distance, occlusion and Doppler processing.

Original recording, saved license page, deterministic processing script and numerical audit are retained in `audio-sources/v0.6/`. The spectrum review and generated analysis arrays belong to the development-only `artifacts/model-upgrade-v0.6/audio-assets/` directory and are not needed in the release. Preparation ran in background with Blender's Audaspace decoder and NumPy; no audio device or desktop playback was used. Spectral and waveform checks found a continuous engine/rotor-dominated section and no obvious discontinuity; this is not a claim of human listening certification or automated speech recognition. The gameplay sound system should mix this layer below its limiter, rather than simply adding a second full-level rotor track.

## Downloaded research candidates, not used in the runtime loop

- **Helicopter SFX**, WuxiaScrub, CC0 1.0: https://opengameart.org/content/helicopter-sfx ; https://creativecommons.org/publicdomain/zero/1.0/ ; direct source https://opengameart.org/sites/default/files/heli_0.ogg . Saved as `wuxiascrub-heli-source.ogg` alongside the author's licensing page. The description does not document the original recording method, so it was not used to substantiate the real-recording requirement.
- **Helicopter Sounds**, aquinn, CC0 1.0: https://opengameart.org/content/helicopter-sounds ; https://creativecommons.org/publicdomain/zero/1.0/ ; direct source https://opengameart.org/sites/default/files/helicopter_0.mp3 . Saved as `aquinn-helicopter-source.mp3` alongside the author's licensing page. This is a collection with several cuts rather than the chosen continuous field recording.

No recorded explosion or gunshot from these searches is included. Existing synthesized effects are separate original project work. Author credit here does not imply endorsement of this game.

## Original convoy engine layer (0.7)

`src/audio.js` synthesizes a deterministic diesel pulse, harmonic body and filtered mechanical noise loop. Nearby moving and parked occupied vehicles feed a bounded shared engine mix; distance attenuates it, camera direction changes its stereo position, and vehicle speed changes playback rate. It is an original synthetic effect, not a recording of an HMMWV or M35A2. Pause suspends playback and leaving gameplay resets its gain. Loop continuity, finite samples, level, distance attenuation, stereo response and inactive muting are tested without speaker output.
