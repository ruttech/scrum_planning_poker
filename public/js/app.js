window.App = {
  vent: _.extend({}, Backbone.Events),
  socket: io.connect(location.origin.replace(/^http/, 'ws')),
  Cards: [0, '.5', 1, 2, 3, 5, 8, 13, 20, 40, 100]
};

App.Router = (function() {
  var Router = Backbone.Router.extend({
    routes: {
      '': 'create',
      '*room': 'room'
    }
  });

  return Router;
})();

App.StoryModel = Backbone.Model.extend({
  url: null,
  sync: function() { return false; }
});

App.UserModel = Backbone.Model.extend({
  defaults: {
    id: null,
    type: null,
    username: null
  },
  url: null,
  sync: function() { return false; }
});

App.UsersCollection = Backbone.Collection.extend({
  url: null,
  model: App.UserModel,
  displayVotes: function() {
    var display = true;
    _.each(this.models, function(model) {
      if (model.get('type') == 'voter' && !model.get('vote')) {
        display = false;
      }
    });
    return display;
  },
  comparator: function(a, b) {
    var buff1 = a.get('type') == 'observer' ? 10 : 0;
    var buff2 = b.get('type') == 'observer' ? 10 : 0;
    var value1 = a.get('username').toString().toLowerCase();
    var value2 = b.get('username').toString().toLowerCase();
    var sortValue = value1 > value2 ? 1 : -1;
    return sortValue - (buff1 - buff2);
  },
  sync: function() { return false; }
});

App.AttendeesView = (function() {
  var View,
      template;

  template = _.template(
              '<p class="h2">Awesome People</p>' +
              '<ul class="list-group">' +
                '<% _.each(users, function(user) {%>'+
                  '<li class="list-group-item <%=user.type %>">' +
                    '<span class="pull-left">' +
                      '<i class="fa fa-<%=user.type %>"></i>' +
                    '</span>' +
                    '<span class="pull-right">' +
                      '<% if (user.vote) { %>' +
                        '<% if (display) { %>' +
                          '<span class="vote"><%= user.vote %></span>' +
                        '<% } else { %>'+
                          '<i class="fa fa-check"></i>' +
                        '<% }; %>'+
                      '<% } else if (user.type == \'voter\') { %>'+
                        '<i class="fa fa-commenting-o"></i>' +
                      '<% }; %>'+
                    '</span>' +
                    '<span class="name"><%- user.username %></span>' +
                  '</li>' +
                '<% }) %>' +
              '</ul>' +
              '<button type="button" class="btn btn-sm btn-warning">Clear Board</button>' +
              '<button type="button" class="btn btn-sm btn-info">Display Votes</button>'
              );

  View = Backbone.View.extend({
    template: template,
    events: {
      'click .btn-warning': 'onClearBoard',
      'click .btn-info': 'onDisplayVotes'
    },
    initialize: function(config) {
      Backbone.View.prototype.initialize.apply(this, arguments);
      this.listenTo(this.collection, 'add sort remove change reset', this.render);
      this.listenTo(App.vent, 'vote:display_votes', this.displayVotes.bind(this));
      this.forceDisplay = false;
    },
    render: function() {
      this.delegateEvents();
      this.$el.html(
        this.template({
          users: this.collection.toJSON(),
          display: this.forceDisplay || this.collection.displayVotes()
        })
      );
      return this;
    },
    displayVotes: function(value) {
      this.forceDisplay = value;
      this.render();
    },
    onDisplayVotes: function(e) {
      e.preventDefault();
      App.vent.trigger('vote:display');
    },
    onClearBoard: function(e) {
      e.preventDefault();
      App.vent.trigger('vote:clear');
    }
  });

  return View;
})();

App.PokerCardsView = (function() {
  var View,
      template,
      Cards = App.Cards.concat(['<i class="fa fa-question"></i>', '<i class="fa fa-coffee"></i>']);

  template = _.template(
              '<% _.each(cards, function(card) {%>' +
                '<a href="javascript:void(0);" class="card" data-value=\'<%- card %>\'><span class="number"><%= card %></span></a>' +
              '<% }); %>'
              );

  View = Backbone.View.extend({
    template: template,
    events: {
      'click a.card': 'onCardSelected'
    },
    initialize: function(config) {
      Backbone.View.prototype.initialize.apply(this, arguments);
      this.listenTo(App.vent, 'vote:clear', this.onVoteClear.bind(this));
    },
    render: function() {
      this.delegateEvents();
      this.$el.html(
        this.template({ cards: Cards })
      );
      return this;
    },
    onCardSelected: function(e) {
      e.preventDefault();
      var ele   = $(e.currentTarget);

      if (!ele.hasClass('selected')) {
        vote = ele.attr('data-value')+'';
        this.$el.find('a.card').removeClass('selected');
        ele.addClass('selected');
      } else {
        vote = null;
        this.$el.find('a.card').removeClass('selected');
      }
      App.vent.trigger('vote:selected', vote);
    },
    onVoteClear: function() {
      this.$el.find('a.card')
              .removeClass('selected');
    }
  });

  return View;
})();

App.PokerObserverView = (function() {
  var View,
      template;

  template = _.template(
    '<% if (count == 0) { %>' +
      '<div class="alert alert-warning">So lonely...</div>' +
    '<% } else if (display) { %>' +
      '<div class="alert alert-success">Voting Done.</div>' +
    '<% } else { %>' +
      '<div class="alert alert-info">Waiting for votes....</div>' +
    '<% }; %>'
  );

  View = Backbone.View.extend({
    id: 'observerView',
    template: template,
    initialize: function(config) {
      Backbone.View.prototype.initialize.apply(this, arguments);
      this.listenTo(this.collection, 'add sort remove change reset', this.render);
    },
    render: function() {
      this.delegateEvents();
      this.$el.html(
        this.template({
          display: this.collection.displayVotes(),
          count: this.collection.length
        })
      );
      return this;
    }
  });

  return View;
})();

App.StatsView = (function() {
  var View,
      template;

  template = _.template('\
    <p class="h2">Statistics</p>\
    <table class="table table-bordered">\
      <thead>\
        <tr>\
          <th>Vote</th>\
          <th>Total</th>\
        </tr>\
      </thead>\
      <tbody>\
        <% _.each(totals, function(count, value) { %>\
          <tr>\
            <td><%= value %></td>\
            <td><%= count %></td>\
          </tr>\
        <% }); %>\
      </tbody>\
    </table>\
  ');

  View = Backbone.View.extend({
    template: template,

    initialize: function(config) {
      Backbone.View.prototype.initialize.apply(this, arguments);
      this.listenTo(this.collection, 'add sort remove change reset', this.onCollectionChange.bind(this));
      this.listenTo(App.vent, 'vote:display_votes', this.onDisplayVotes.bind(this));
      this.listenTo(App.vent, 'vote:clear', this.onVotesClear.bind(this));
      this.isShown = false;
    },

    render: function() {
      if (this.isShown) {
        this.$el.html(
          this.template({
            totals: this.totals()
          })
        );
      } else {
        this.$el.empty();
      }

      return this;
    },

    onDisplayVotes: function (value) {
      this.isShown = value || this.collection.displayVotes();
      this.render();
    },

    onCollectionChange: function () {
      this.onDisplayVotes(false);
    },

    onVotesClear: function () {
      this.isShown = false;
      this.render();
    },

    totals: function() {
      var votes = this.collection.pluck('vote').map(function (vote) {
        return typeof vote !== 'undefined' && vote !== null ? vote : 'none';
      });

      return _.countBy(votes);
    },
  });

  return View;
})();

App.PokerView = (function() {
  var View,
      template,
      AttendeesView = App.AttendeesView,
      StatsView     = App.StatsView,
      CardsView     = App.PokerCardsView,
      ObserverView  = App.PokerObserverView;

  template =  _.template('<div class="container poker">' +
                '<div class="row">' +
                  '<div class="col-xs-7">' +
                    '<p class="h5 text-right"><span class="username"></span> <a href="javascript:void(0);" class="logout">(logout)</a></p>' +
                    '<input type="text" class="form-control" id="title" placeholder="Task title">' +
                    '<div class="playing-cards">' +
                      /* Poker View (or Observer View) */
                    '</div>' +
                  '</div>' +

                  '<div class="col-xs-3 attendees">' +
                    /* Attendees View Render Here */
                  '</div>' +

                  '<div class="col-xs-2 stats">' +
                    /* Stats View Render Here */
                  '</div>' +
                '</div>' +
              '</div>' +
              '<div class="input-group input-group-sm" id="poker-sharing">' +
                '<span class="input-group-addon"><i class="fa fa-share"></i></span>' +
                '<input type="text" class="form-control" id="share">' +
              '</div>');

  View = Backbone.View.extend({
    template: template,
    bindings: {
      'input#title': 'title',
      '.username': 'username'
    },
    events: {
      'click a.logout': 'onLogoutClick',
      'keyup input#title': 'onTitleChanged'
    },
    initialize: function(config) {
      Backbone.View.prototype.initialize.apply(this, arguments);
      this.subViews = {};
      this.subViews['attendees'] = new AttendeesView({collection: this.collection});
      this.subViews['stats'] = new StatsView({collection: this.collection});
      this.subViews['cards'] = new CardsView();
      this.subViews['observer'] = new ObserverView({collection: this.collection});
    },
    render: function() {
      this.$el.html(this.template());
      this.$el.find('#share').val( window.location.href );
      this.$el.find('.attendees').html(
        this.subViews.attendees.render().el
      );
      this.$el.find('.stats').html(
        this.subViews.stats.render().el
      );
      if (this.model.get('type') == 'observer') {
        this.$el.find('.playing-cards').html(
          this.subViews.observer.render().el
        );
      } else {
        this.$el.find('.playing-cards').html(
          this.subViews.cards.render().el
        );
      }
      this.stickit();
      this.delegateEvents();
      return this;
    },
    remove: function() {
      for(var i in this.subViews) {
        var view = this.subViews[i];
        view.remove();
      }
      Backbone.View.prototype.remove.apply(this, arguments);
    },
    onTitleChanged: function(e) {
      App.vent.trigger('title:changed', this.model.get('title'));
    },
    onLogoutClick: function(e) {
      e.preventDefault();
      if (confirm('Are you sure you want to leave?')) {
        App.vent.trigger('user:logout');
      }
    }
  });

  return View;
})();

App.LoginScreen = (function() {
  var template =  _.template(
                  '<div class="container login-card-bg">' +
                    '<h1>Planning Poker <small>the simple way for co-located people</small></h1>' +
                    '<div>' +
                      '<% _.each(cards, function(card) {%>' +
                        '<a href="javascript:void(0);" class="card" data-value=\'<%- card %>\'><span class="number"><%= card %></span></a>' +
                      '<% }); %>' +
                    '</div>' +
                  '</div>' +
                  '<div class="container credentials">' +
                    '<div class="well well-sm">' +
                      '<form class="form-horizontal">' +
                        '<fieldset>' +
                          '<legend>Enter in your credentials</legend>' +
                          '<div class="form-group">' +
                            '<input type="text" class="form-control" id="name" placeholder="Your callsign">' +
                          '</div>' +
                          '<div class="input-group">' +
                            '<select class="form-control" id="user_type">' +
                              '<option value="voter">As Voter</option>' +
                              '<option value="observer">As Observer</option>' +
                            '</select>' +
                            '<span class="input-group-btn">' +
                              '<button class="btn btn-primary" type="submit">Enter <i class="fa fa-sign-in"></i></button>' +
                            '</span>' +
                          '</div>' +
                        '</fieldset>' +
                      '</form>' +
                    '</div>' +
                  '</div>'
                );

  return Backbone.View.extend({
    id: 'loginView',
    template: template,
    events: {
      'submit form': 'onFormSubmit'
    },
    render: function() {
      var cards = App.Cards.concat(App.Cards)
                           .concat(App.Cards)
                           .concat(App.Cards)
                           .concat(App.Cards)
                           .concat(App.Cards)
                           .concat(App.Cards)
                           .concat(App.Cards);

      this.$el.html( this.template({cards: cards}) );
      return this;
    },
    onFormSubmit: function(e) {
      e.preventDefault();
      var name = this.$el.find('#name').val().trim(),
          type = this.$el.find('#user_type').val();

      if (name.length > 0) {
        App.vent.trigger('user:login', name, type);
      } else {
        alert('You need a call sign.');
      }
    }
  });
})();

App.MainView = (function() {
  var View;

  View = Backbone.View.extend({
    initialize: function(config) {
      Backbone.View.prototype.initialize.apply(this, arguments);

      this.socket             = config.socket;
      this.subViews           = {};
      this.subViews['screen'] = new App.PokerView({collection: this.collection, model: this.model});
      this.listenTo(App.vent, 'title:changed', this.onTitleSet.bind(this));
      this.listenTo(App.vent, 'vote:selected', this.onVoteSet.bind(this));
      this.listenTo(App.vent, 'vote:display', this.onVoteDisplay.bind(this));
      this.listenTo(App.vent, 'vote:clear', this.onVoteClear.bind(this));
      this.socket.on('message', this.onSocketMessage.bind(this));
    },
    remove: function() {
      this.socket.off('message', this.onSocketMessage.bind(this));
      Backbone.View.prototype.remove.apply(this, arguments);
    },
    render: function() {
      this.$el.html( this.subViews['screen'].render().el );
      return this;
    },
    addUser: function(user) {
      var exists = !!this.collection.find({id: user.id});
      if (!exists) { this.collection.add(user); }
    },
    onTitleSet: function(value) {
      this.socket.emit('rt.title', value);
    },
    onVoteSet: function(value) {
      this.socket.emit('rt.vote', value);
    },
    onVoteDisplay: function() {
      this.socket.emit('rt.vote:display');
    },
    onVoteClear: function() {
      this.socket.emit('rt.vote:clear');
    },
    updateMemberVote: function(data) {
      model = this.collection.find({id: data.id});
      model.set('vote', data.vote);
    },
    onSocketMessage: function(title, message) {
      switch(title) {
        case 'title:update':
          this.model.set('title', message);
        case 'users:remove':
          this.collection.remove(message);
          break;
        case 'users:add':
          this.collection.add(message);
          break;
        case 'users:list':
          this.collection.add(message);
          break;
        case 'vote:update':
          this.updateMemberVote(message);
          break;
        case 'vote:display':
          App.vent.trigger('vote:display_votes', message);
          break;
      }
    }
  });

  return View;
})();

$(document).ready(function() {
  var USER_ROOM_ID = null,
      socket      = App.socket,
      users       = new App.UsersCollection(),
      story       = new App.StoryModel(),
      pokerView   = new App.MainView({ collection: users,
                                       model: story,
                                       socket: socket}),
      loginView   = new App.LoginScreen(),
      router      = new App.Router();

  /* Reusable Methods */
  var render = function(view) {
        $('#content').html(view.render().el);
      },
      fetchUserFromCookie = function() {
        if ($.cookie('_user')) {
          try {
            return JSON.parse($.cookie('_user'));
          } catch(e) {
            return {};
          }
        } else {
          return {};
        }
      },
      storeUser = function(user) {
        data = _.omit(user, 'room', 'id');
        $.cookie('_user', JSON.stringify(data), { expires: 7 * 4 });
      },
      authenticated = function() {
        return !!user.username;
      },
      user = fetchUserFromCookie();

  /* App Listener */
  App.vent.on('user:login', function(username, type) {
    user = { username: username,
             type: type,
             room: USER_ROOM_ID };

    storeUser(user);
    socket.emit('rt.user', user);
  });

  App.vent.on('user:logout', function() {
    storeUser({});
    location.reload();
  });


  /* Socket Listeners */
  socket.on('reconnect', function() {
    socket.emit('rt.user', user);
  });

  socket.on('disconnect', function() {
    /* Show D/C overlay */
    //
  });

  socket.on('message', function(title, message) {
    switch(title) {
      case 'authorized':
        user = message;
        story.set('username', message.username);
        story.set('type', message.type);
        render(pokerView);
        break;
    }
  });

  /* Router */
  router.on('route:create', function(actions) {
    router.navigate(Math.random().toString(36).slice(2), {trigger: true});
  });

  router.on('route:room', function(room) {
    USER_ROOM_ID = room;
    if (authenticated()) {
      App.vent.trigger('user:login', user.username, user.type);
    } else {
      render(loginView);
    }
  });
  Backbone.history.start();
});
