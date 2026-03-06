/**
 * SQ.Screens.Setup — New game configuration screen.
 * Full setup flow will be built in a later prompt.
 */
(function () {
  SQ.Screens.Setup = {
    init: function () {
      document.getElementById('btn-start-game').addEventListener('click', function () {
        // Placeholder — use default config for now
        var setupConfig = {
          setting: 'dark fantasy',
          archetype: 'disgraced knight',
          writingStyle: 'literary',
          tone: 'dark and atmospheric',
          perspective: 'second person',
          tense: 'present',
          difficulty: 'normal',
          storyLength: 'medium',
          characterName: 'The Wanderer'
        };

        // Create new game state
        SQ.GameState.create(setupConfig);
        SQ.HistoryStack.clear();

        // Generate skeleton
        SQ.SkeletonGenerator.generate(setupConfig).then(function (skeleton) {
          var state = SQ.GameState.get();
          state.skeleton = skeleton;
          state.meta.title = skeleton.title || 'Untitled Quest';
          state.world_flags = skeleton.initial_world_flags || {};

          // Set initial relationships from NPC roster
          if (skeleton.npcs) {
            skeleton.npcs.forEach(function (npc) {
              state.relationships[npc.name] = npc.initial_relationship || 0;
            });
          }

          SQ.GameState.save();

          // Generate opening passage
          return SQ.PassageGenerator.generate(state, null);
        }).then(function (passageResponse) {
          var state = SQ.GameState.get();

          // Push initial state to history
          SQ.HistoryStack.push(SQ.GameState.snapshot(), '', null);

          // Apply passage response
          state.last_passage = passageResponse.passage;
          state.current_choices = passageResponse.choices;
          if (passageResponse.state_updates) {
            if (passageResponse.state_updates.current) {
              SQ.GameState.updateCurrent(passageResponse.state_updates.current);
            }
          }

          SQ.GameState.save();
          SQ.showScreen('game');
        }).catch(function (err) {
          console.error('Setup: generation failed', err);
          alert('Failed to generate story: ' + err.message);
        });
      });
    },

    onShow: function () {
      // TODO: populate setup form with options
    },

    onHide: function () {}
  };
})();
