import React , { Component } from 'react'
import {
	ListGroup,
	InputGroup,
	Form,
	Container,
	Row,
	Col,
	Navbar,
	Nav,
	NavDropdown,
	Button,
	FormControl,
	Tabs,
	Tab,
	Card,
	Modal
} from 'react-bootstrap';
import VirtualList from 'react-virtual-list';
import TimePicker from 'react-bootstrap-time-picker';
import axios from 'axios'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { 
	faPlus,
	faMinusCircle,
	faTrash,
	faEnvelope
} from '@fortawesome/free-solid-svg-icons'
import 'bootstrap/dist/css/bootstrap.min.css';
import io from "socket.io-client";

import Collections from './components/Collections'

// Redux
import { connect } from 'react-redux';
import {
	fetchCollections,
	createCollection,
	addToCollection
} from './actions/collectionAction';

import socket from './socket.js'

const SECONDS_IN_DAY = 24 * 60 * 60
const DAYS = ['Mon', 'Tue' , 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const TEN_AM = 10 * 60 * 60 // Default starting filter time

class ListExampleBasic extends Component {
  timer;

  state = {
    time: TEN_AM,
    searchedName: '',
    selectedDays: {},
    items: [],
    filteredRestaurants: [],

    myCollections: [],

    showAddRestaurantModal: false,
    modalTitle: '',
    modalId: '',
    modalCheckboxes: {},

    showShareModal: false,
    emailRecipients: [""],
    modalRestaurantCollection: {},
  }
  constructor(props){
  	super(props);
  	let selectedDays = {}
  	// Create an obj that holds all of the days with a corresponding checked value, default all to true
  	DAYS.forEach(day => selectedDays[day] = true )
  	this.state.selectedDays = selectedDays;

    axios.get('http://localhost:8080/api/GetData')
      .then(response => {
        const { data } = response;
        this.setState({
          items:data,
          filteredRestaurants:data
        })
      })
      .catch(function (error) {
        console.log(error);
      });

		const urlParams = new URLSearchParams(window.location.search);
		const invitedCollection = urlParams.get('invitedCollection'); 
    let collectionIds = localStorage.getItem('collectionIds') || "[]";
    if(invitedCollection){
    	collectionIds = JSON.parse(collectionIds);
    	if(!collectionIds.includes(invitedCollection)) collectionIds.push(invitedCollection);
    	collectionIds = JSON.stringify(collectionIds);
    	localStorage.setItem('collectionIds',collectionIds);
    }

    this.props.fetchCollections(collectionIds);

    axios.get('http://localhost:8080/api/GetRestaurantCollections',{
    	params: {
    		collectionIds: collectionIds
    	}
    })
    .then(response => {
      const { data } = response;
      this.setState({ myCollections:data })
    })
    .catch(function (error) {
      console.log(error);
    });

  }

  componentDidMount() {
    socket.emit('initialSubscription', JSON.parse(localStorage.getItem('collectionIds')));
    socket.on("collectionRenamed", data => this.setState({ response: data }));
  }

  filterName = (event) => {
  	const {value} = event.target;
    clearTimeout(this.timer);
    this.timer = setTimeout(()=>{ 
      const searchedName = value;
      this.setState({searchedName},()=>{
      	this.filterRestaurants();
      })
    }, 300);
  }

  filterTime = time => {
  	// console.log(time);
    this.setState({ time }, ()=>{
    	this.filterRestaurants();
    })
  }

	filterDay = (event) => {
		const {selectedDays} = this.state;
		const {day} = event.target.dataset;
		const {checked} = event.target;
		this.setState({
			selectedDays: {
				...selectedDays,
				[day]: checked
			}
		}, () => {
			this.filterRestaurants();
		})
	}

	filterRestaurants = () =>{
	  let filteredRestaurants = []
	  let { items, searchedName, time, selectedDays} = this.state 
	  for (let i = 0; i < items.length; i++) {
	  	const name = items[i]['name'].toLowerCase();
	  	let timeFound = false;
	  	for(let day in selectedDays){
	  		// First filter by the selected day(s)
	  		if(selectedDays[day]){
		  		let {start, end} = items[i]['time'][day.toLowerCase()];
			  	// If the end is less than the start, we must add 24 hours to it is counted as the next day
			  	// Not sure if this logic should be moved to database
			  	if(end < start){
			  		end += SECONDS_IN_DAY
			  	}
			  	// Then, filter by the selected time
	    		// We aren't sure which 'day' the specified time lands on, so we check both and return a match if either is satisfied
	    	  const withinTimeRange = ((start <= time && end >= time) || (start <= time+SECONDS_IN_DAY && end >= time+SECONDS_IN_DAY));
	    	  timeFound = withinTimeRange;
	    	  if(timeFound) break;	  			
	  		}
	  	}
	  	// Finally, filter by the searched name
	    if (name.indexOf(searchedName) !== -1 &&
	    		timeFound
	    	){
	    	filteredRestaurants.push(items[i])
	    }
	  }  	
	  this.setState({filteredRestaurants})
	}

	showAddRestaurantModal = (restaurant) => {
		const {myCollections} = this.state
		const {_id, name} = restaurant;
		let modalCheckboxes = {}
		myCollections.forEach(collection => modalCheckboxes[collection._id] = false )
		this.setState({
			showAddRestaurantModal: true,
			modalTitle: name,
			modalId: _id,
			modalCheckboxes
		})
	}

	closeAddRestaurantModal = () => {
		this.setState({
			showAddRestaurantModal: false,
			modalTitle:'',
			modalId:'',
			modalCheckboxes: {},
		})
	}

	showShareModal = (restaurant) => {
		this.setState({
			showShareModal: true,
		})
	}

	closeShareModal = () => {
		this.setState({
			showShareModal: false,
		})
	}

	handleChange = (event) => {
		const {modalCheckboxes} = this.state;
		const { id } = event.target.dataset;
		console.log(id)
		const {checked} = event.target;
		this.setState({
			modalCheckboxes: {
				...modalCheckboxes,
				[id]: checked
			}
		})
	}

	addToCollections = () => {
		const {modalCheckboxes, modalId} = this.state
		const newCollectionName = document.getElementById('new-collection-input').value;
		let collectionIds = [];
		for(let key in modalCheckboxes){
			if(modalCheckboxes[key]) collectionIds.push(key);
		}
		axios.post('http://localhost:8080/api/AddToRestaurantCollections', {
		    collectionIds: JSON.stringify(collectionIds),
		    restaurantId: modalId
		  })
		  .then( response => {
		  	// pass
		  })
		  .catch(function (error) {
		    console.log(error);
		  });

		//This creates a new collection
		if(newCollectionName){
			this.props.createCollection(newCollectionName, modalId);
		}
		this.closeAddRestaurantModal();
	}

	removeFromCollection = (collectionId, restaurantId) => {
		axios.post('http://localhost:8080/api/RemoveFromRestaurantCollection', {
		    collectionId,
		    restaurantId
		  })
		  .then((response) => {
		  	//pass
		  })
		  .catch(function (error) {
		    console.log(error);
		  });
	}

	deleteCollection = (collectionId) => {
		axios.post('http://localhost:8080/api/DeleteRestaurantCollection', {
		    collectionId,
		  })
		  .then((response) => {
		  })
		  .catch(function (error) {
		    console.log(error);
		  });
	}

	shareRestaurantCollection = (modalRestaurantCollection) => {
		this.setState({
			modalRestaurantCollection
		})
		this.showShareModal();
	}

	addEmailRecipient = () => {
		this.setState({
			emailRecipients: [...this.state.emailRecipients, ""]
		})
	}

	handleEmailChange = (event) => {
		const { emailRecipients } = this.state;
		const { index } = event.target.dataset;
		const { value } = event.target;
		console.log(event.target);
		emailRecipients[index] = value;
		this.setState({
			emailRecipients
		})
	}

	inviteFriends = () => {
		const { emailRecipients , modalRestaurantCollection } = this.state;
		console.log(modalRestaurantCollection)
		axios.post('http://localhost:8080/api/InviteFriends', {
		    emails: emailRecipients,
		    collection: modalRestaurantCollection
		  })
		  .then((response) => {
		  	//
		  })
		  .catch(function (error) {
		    console.log(error);
		  });
		this.closeShareModal();
	}

  render(){
  	const MyList = ({ virtual, itemHeight}) => (
			<ListGroup style={virtual.style}>
	        {
	          virtual.items.map((item,index)=>{
	            return( 
	              <div key={index} style={{height:itemHeight, display:'flex',flexDirection:'row'}}>
	              	<ListGroup horizontal style={{flex:1, marginBottom:'10px'}}>
		                <ListGroup.Item className={'list-item'}>{item.name}</ListGroup.Item>
		                <ListGroup.Item className={'list-item'}>{item.openingHours}</ListGroup.Item>
		                <ListGroup.Item 
		                	variant={'primary'} 
		                	style={{cursor:'pointer',display:'flex',justifyContent:'center',alignItems:'center',width:itemHeight}}
		                	onClick={()=>{this.showAddRestaurantModal(item)}}
	                	>
	                			<FontAwesomeIcon style={{fontSize:'30px'}} icon={faPlus} />
		                </ListGroup.Item>
	                </ListGroup>
	              </div>
	            )
	          })
	        }
	      </ListGroup>
		);

  	const MyVirtualList = VirtualList()(MyList);
    return(
    	<div>
				{/*<Tabs style={{paddingTop:'10px'}}transition={false} defaultActiveKey="home" id="uncontrolled-tab-example">*/}
				<Tabs style={{paddingTop:'10px'}}transition={false} defaultActiveKey="home">
					<h2>Is it open?</h2>
				  <Tab title={<h3>Is it open?</h3>} disabled>
				    <h3>Hello</h3>
				  </Tab>
				  <Tab eventKey="home" title="Home">
			      <Container style={{paddingTop:'20px', paddingBottom:'20px'}}>
			      	<div>
							  <Form.Group controlId="formBasicName">
							    <Form.Label>Search</Form.Label>
							    <Form.Control onChange={this.filterName} placeholder="Restaurant Name" />
							  </Form.Group>
								<Form>
								    <div className="mb-3">
								    	{ DAYS.map((day,index) => (
								      	<Form.Check 
								      		checked={this.state.selectedDays[day]} 
								      		onChange={this.filterDay}
								      		key={`checkbox-${day}`} 
								      		data-day={day}
								      		inline 
								      		label={day} 
								      		type={'checkbox'} 
								      		id={`checkbox-${day}`} 
								      	/>
								      ))}
								    </div>
								</Form>
				        <TimePicker onChange={this.filterTime} value={this.state.time} start="00:00" end="23:59" step={30} />
			        </div>
			        <h3 style={{marginTop:'20px', marginBottom:'20px', textAlign:'center'}}> Restaurants </h3>
							<MyVirtualList
							  items={this.state.filteredRestaurants}
							  itemHeight={85}
							/>
			      </Container>
				  </Tab>
				  <Tab eventKey="collections" title="Collections">
				  	<Collections/>
				  </Tab>
				</Tabs>
	      <Modal show={this.state.showAddRestaurantModal} onHide={this.closeAddRestaurantModal}>
	        <Modal.Header closeButton>
	          <Modal.Title>{this.state.modalTitle}</Modal.Title>
	        </Modal.Header>
	        <Modal.Body>
	        	<Form.Control id="new-collection-input" placeholder="New collection" />
			    	{ this.props.collections.map((collection,index) => {
	        		const { _id, name } = collection;
	        		return (
	        			<ListGroup key={`collection-${_id}`} horizontal style={{height:'38px',flex:1, marginTop:'10px'}}>
					    		<ListGroup.Item style={{flex:1,}}>{name}</ListGroup.Item>
					    		<ListGroup.Item style={{display:'flex',alignItems:'center',justifyContent:'center',width:'38px'}}>
							      	<Form.Check 
							      		style={{padding:0}}
							      		checked={this.state.modalCheckboxes[_id]} 
							      		onChange={this.handleChange}
							      		data-id={_id}
							      		type={'checkbox'} 
							      		id={`checkbox-${_id}`} 
							      	/>
					    		</ListGroup.Item>
				    		</ListGroup>
				    	)
			      })}
        	</Modal.Body>
	        <Modal.Footer>
	          <Button variant="secondary" onClick={this.closeAddRestaurantModal}>
	            Close
	          </Button>
	          <Button variant="primary" onClick={this.addToCollections}>
	            Add
	          </Button>
	        </Modal.Footer>
	      </Modal>

	      <Modal show={this.state.showShareModal} onHide={this.closeShareModal}>
	        <Modal.Header closeButton>
	          <Modal.Title>{`Share`}</Modal.Title>
	        </Modal.Header>
	        <Modal.Body style={{textAlign:'center'}}>
	        	{
	        		this.state.emailRecipients.map((email,index)=>
	        			<Form.Control 
	        				onChange={this.handleEmailChange}
	        				value={email} 
	        				id={`share-email-input-${index}`}
	        				data-index={index}
	        				style={{marginBottom:'1rem'}} 
	        				placeholder="johndoe@gmail.com" 
        				/>
	        		)
	        	}
	          <Button variant="primary" onClick={this.addEmailRecipient}>
	            Add
	          </Button>
	        </Modal.Body>
	        <Modal.Footer>
	          <Button variant="secondary" onClick={this.closeShareModal}>
	            Close
	          </Button>
	          <Button variant="primary" onClick={this.inviteFriends}>
	            Share
	          </Button>
	        </Modal.Footer>
	      </Modal>

      </div>
    )
  }
}

const mapStateToProps = state => ({
	collections: state.collectionReducer.collections,
});

const mapDispatchToProps = dispatch => ({
	updateMessages: (data) => {
		// dispatch(removeFromCollection(messages));
	},
	fetchCollections: (collectionIds) => {
		dispatch(fetchCollections(collectionIds))
	},
	createCollection: (name, restaurantId) => {
		dispatch(createCollection(name, restaurantId))
	},
	addToCollection: (collectionIds, restaurantId) => {
		dispatch(addToCollection(collectionIds, restaurantId))
	}
});

export default connect(
	mapStateToProps,
	mapDispatchToProps
)(ListExampleBasic);